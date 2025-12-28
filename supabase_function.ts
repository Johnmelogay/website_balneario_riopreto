import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        )

        const googleApiKey = Deno.env.get('GOOGLE_API_KEY');
        const { text, sender, image_url, madeby, device, location } = await req.json()

        // IP Fallback if not sent by client (e.g. CLI or direct curl)
        const ipFromHeader = req.headers.get('x-forwarded-for') || "Unknown IP";
        const finalLocation = location || ipFromHeader;
        const finalDevice = device || req.headers.get('user-agent') || "Unknown Device";
        const finalMadeBy = madeby || "AI/Unknown";

        console.log(`[Gemini Logic V4] Input: "${text.substring(0, 50)}..."`);

        // --- 1. PROMPT ENGINEERING (REFINED FOR AGE RULES) ---
        const currentYear = new Date().getFullYear();
        const prompt = `
      Extract reservation details from this text into a specific JSON format.
      Current Year: ${currentYear}.
      
      Input: "${text}"
      
      CRITICAL PRICING & AGE RULES:
      1. "Casal" = 2 adults.
      2. AGE 8+ (>=8 years old) counts as 1 ADULT.
      3. AGE 5-7 (5, 6, 7 years old) counts as "children_5_7".
      4. AGE 0-4 (<5 years old) is FREE (do not count in pricing fields).
      
      Keywords:
      - "Pago", "sinal", "adiantou", "entrada" = 'advance_payment'.
      - "Valor", "total" = 'total_price'.
      
      Output JSON ARRAY:
      [{
        "chalet_id": number | null,
        "guest_name": string,
        "contact_info": string (Phone/Email),
        "checkin_date": "YYYY-MM-DD",
        "checkout_date": "YYYY-MM-DD" (or null if not specified),
        "total_price": number,
        "advance_payment": number,
        "arrival_time": "HH:MM" (default "14:00"),
        "adults": number (Count of everyone >= 8 years old. Default 2 for "Casal"),
        "children_5_7": number (Count of everyone aged 5 to 7),
        "notes": string
      }]
    `;

        // CALL GEMINI
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${googleApiKey}`;
        const geminiResp = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const geminiData = await geminiResp.json();

        // PARSE AI
        const aiText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
        let bookings = [];
        try {
            let cleanText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
            if (!cleanText.endsWith(']')) cleanText += ']';
            bookings = JSON.parse(cleanText);
        } catch (e) {
            console.error("JSON Parse Fail", e);
            try { bookings = JSON.parse(aiText.substring(0, aiText.lastIndexOf('}') + 1) + "]"); } catch (e2) { }
        }
        if (!Array.isArray(bookings)) bookings = [bookings];

        // --- 2. LOGIC ENGINE ---

        const validBookings = [];
        const rejectedReasons = [];

        for (const b of bookings) {
            const reason = [];

            // A. VALIDATION & DEFAULTS
            if (!b.guest_name) reason.push("Faltou Nome");
            if (!b.checkin_date) reason.push("Faltou Data Entrada");

            // Fix Checkout (Default 1 Night)
            if (b.checkin_date && !b.checkout_date) {
                const start = new Date(b.checkin_date);
                start.setDate(start.getDate() + 1);
                b.checkout_date = start.toISOString().split('T')[0];
            }

            if (!b.contact_info) b.contact_info = sender;
            if (!b.chalet_id) {
                b.chalet_id = Math.floor(Math.random() * 10) + 1; // Auto-Assign Random
                b.auto_assigned = true;
            }
            if (!b.adults) b.adults = 2; // Default Casal
            if (!b.children_5_7) b.children_5_7 = 0; // Default 0

            // B. PRICING CALCULATOR (The "Truth")
            let calculatedTotal = 0;
            let nights = 0;
            if (b.checkin_date && b.checkout_date) {
                const d1 = new Date(b.checkin_date);
                const d2 = new Date(b.checkout_date);
                const diff = (d2 - d1) / (1000 * 60 * 60 * 24);
                nights = Math.ceil(diff);

                if (nights > 0) {
                    // Logic: Base 280 (2 pax). 
                    let daily = 280;

                    // Extra Adults (Rule: >=8 years old are adults)
                    if (b.adults > 2) daily += (b.adults - 2) * 40;

                    // Half-Paying Children (Rule: 5-7 years old = Half Price = R$20)
                    if (b.children_5_7 > 0) daily += (b.children_5_7 * 20);

                    let total = daily * nights;

                    // Friday Checkin Discount check
                    const checkinObj = new Date(b.checkin_date + "T12:00:00");
                    if (checkinObj.getDay() === 5 && nights >= 2) {
                        total -= 40;
                    }

                    calculatedTotal = total;
                }
            }

            // C. PRICE OVERRIDE LOGIC
            // If AI extraction is missing or looks like just the advance payment (e.g. exactly 50% or low),
            // TRUST THE CALCULATOR.
            if (calculatedTotal > 0) {
                if (!b.total_price || b.total_price < calculatedTotal * 0.95) {
                    // Slight tolerance check, but heavily favor calculator
                    // Exception: User might have negotiated, but for safety in automation, we propose the calculator price.
                    console.log(`Overriding Price: AI=${b.total_price} -> Calc=${calculatedTotal}`);
                    b.total_price = calculatedTotal;
                }
            }

            // D. LATE FEE
            let isLate = false;
            let lateFee = 0;
            if (b.arrival_time) {
                const [h, m] = b.arrival_time.split(':').map(Number);
                if (h >= 17 && (h > 17 || m > 0)) { isLate = true; lateFee = 50; }
            }

            // E. STATUS
            let status = 'pending';

            if (reason.length === 0) {
                validBookings.push({
                    chalet_id: b.chalet_id,
                    checkin_date: b.checkin_date,
                    checkout_date: b.checkout_date,
                    guest_name: b.guest_name,
                    contact_info: b.contact_info,
                    total_price: b.total_price,
                    advance_payment: b.advance_payment || 0,
                    arrival_time: b.arrival_time,
                    adults: b.adults,
                    // children_5_7 is purely for calculation, we don't necessarily need a column for it in DB yet, 
                    // but we store it in raw_message just in case.
                    is_late_arrival: isLate,
                    late_fee: lateFee,
                    status: status,
                    payment_proof_url: image_url || null,
                    auto_assigned: b.auto_assigned || false,
                    // SECURITY
                    madeby: finalMadeBy,
                    device: finalDevice,
                    location: finalLocation,

                    raw_message: JSON.stringify({ original: text, ai_parsed: b })
                });
            } else {
                rejectedReasons.push(reason.join(', '));
            }
        }

        if (validBookings.length === 0) {
            return new Response(JSON.stringify({ success: false, message: `Erros: ${rejectedReasons.join('|')}` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        const { data: insertedData, error } = await supabaseClient.from('bookings').insert(validBookings).select();
        if (error) throw error;

        // SUMMARY MSG
        const formatDateBr = (isoStr: string) => {
            if (!isoStr) return "";
            const [y, m, d] = isoStr.split('-');
            return `${d}/${m}/${y}`;
        };

        const summary = validBookings.map(b =>
            `🏡 Chalé ${b.chalet_id} (${b.status.toUpperCase()})\n` +
            `👥 Pessoas: ${b.adults} Adt${b.raw_message.includes('children_5_7') ? ' + Crianças' : ''}\n` +
            `📆 ${formatDateBr(b.checkin_date)} a ${formatDateBr(b.checkout_date)}\n` +
            `💰 Total: R$${b.total_price} (Pago: R$${b.advance_payment})\n` +
            (b.payment_proof_url ? `📎 Comprovante Anexado\n` : '') +
            (b.auto_assigned ? `🤖 Auto-Atribuído.\n` : '')
        ).join('\n---\n');

        return new Response(JSON.stringify({
            success: true,
            data: insertedData,
            message: `✅ Processado!\n\n${summary}`
        }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );

    } catch (error) {
        return new Response(JSON.stringify({ success: false, message: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 })
    }
})
