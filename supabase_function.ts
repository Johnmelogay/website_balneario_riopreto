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
        if (!googleApiKey) {
            throw new Error("GOOGLE_API_KEY not found in Supabase Secrets");
        }

        const { text, sender } = await req.json()
        console.log(`[Gemini Bot] Processing: "${text.substring(0, 50)}..."`);

        // --- 1. ASK GEMINI (The Real Brain) ---
        const currentYear = new Date().getFullYear();
        const prompt = `
      Extract reservation details from this text into a specific JSON format.
      Current Year Context: ${currentYear}.
      Date Format: YYYY-MM-DD.
      
      Text: "${text}"
      
      Output a JSON ARRAY of objects (because there might be multiple chalets).
      Example: [{"chalet_id": 1, ...}, {"chalet_id": 2, ...}]

      Each object must have:
      {
        "chalet_id": number (extract chalet number, null if missing),
        "checkin_date": string (YYYY-MM-DD),
        "checkout_date": string (YYYY-MM-DD),
        "guest_name": string,
        "adults": number,
        "price": number,
        "additional_info": object (ANY other details found: pets, dietary restrictions, car plate, time of arrival, etc. Put them here as key-value pairs)
      }
    `;

        // Using 'gemini-2.0-flash' as confirmed available by user debug list.
        const modelName = 'models/gemini-2.0-flash';
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/${modelName}:generateContent?key=${googleApiKey}`;

        console.log(`[Gemini Bot] Connecting to: ${geminiUrl.replace(googleApiKey, 'HIDDEN_KEY')}`);

        let geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        });

        let geminiData = await geminiResponse.json();

        // --- SMART DEBUG: LIST MODELS IF 404 ---
        if (geminiData.error && geminiData.error.code === 404) {
            console.warn("Model not found (404). Listing available models...");
            const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${googleApiKey}`;
            const listResp = await fetch(listUrl);
            const listData = await listResp.json();

            const availableModels = listData.models ? listData.models.map(m => m.name) : ["None"];

            throw new Error(
                `Erro 404 (Modelo não encontrado). \n` +
                `Tentei usar: ${modelName}\n` +
                `MODELOS DISPONÍVEIS NA SUA CONTA: \n${availableModels.join('\n')}`
            );
        }

        // Check for Google API Errors explicitly
        if (geminiData.error) {
            console.error("Gemini API Error:", geminiData.error);
            throw new Error(`Gemini Error: ${geminiData.error.message} (Code: ${geminiData.error.code})`);
        }

        if (!geminiData.candidates || !geminiData.candidates[0].content) {
            console.error("Gemini Unexpected Response:", JSON.stringify(geminiData));
            throw new Error("Gemini returned no candidates. Raw: " + JSON.stringify(geminiData));
        }

        const aiText = geminiData.candidates[0].content.parts[0].text;
        console.log("[Gemini Response Raw]", aiText);

        let result = JSON.parse(aiText);

        // Normalize to Array
        if (!Array.isArray(result)) {
            result = [result];
        }

        // --- 2. VALIDATION (Strict Mode) ---
        // Rule: Must have Chalet, Check-in, Name, and Price (Payment)
        const validBookings = result.filter(r =>
            r.chalet_id &&
            r.checkin_date &&
            r.guest_name &&
            (r.price && r.price > 0)
        );

        if (validBookings.length === 0) {
            // Debug reason for failure
            const invalidReason = result.map(r => {
                const missing = [];
                if (!r.chalet_id) missing.push("Nu. Chalé");
                if (!r.checkin_date) missing.push("Data Entrada");
                if (!r.guest_name) missing.push("Nome Hóspede");
                if (!r.price) missing.push("Valor Pago");
                return missing.length > 0 ? `Faltou: ${missing.join(', ')}` : "Dados inválidos";
            }).join(' | ');

            return new Response(
                JSON.stringify({
                    success: false,
                    message: `🤖 Não entendi os dados completos.\nPara confirmar, preciso de:\n- Nome\n- Número do Chalé\n- Data Entrada\n- Valor Pago adiantado.\n\n(Erro: ${invalidReason})`,
                    debug: result
                }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
        }

        // --- 3. DATABASE INSERTION (Batch) ---
        const insertions = validBookings.map(r => ({
            chalet_id: r.chalet_id,
            checkin_date: r.checkin_date,
            checkout_date: r.checkout_date,
            guest_name: r.guest_name || sender || "WhatsApp User",
            additional_info: r.additional_info || {}, // Save the AI extracted extra data
            raw_message: JSON.stringify({ original: text, ai_parsed: r })
        }));

        const { error } = await supabaseClient
            .from('bookings')
            .insert(insertions)

        if (error) throw error

        // Create summary message
        const msgDetails = validBookings.map(r => `🏡 Chalé ${r.chalet_id} (${new Date(r.checkin_date).toLocaleDateString('pt-BR')} a ${new Date(r.checkout_date).toLocaleDateString('pt-BR')})`).join('\n');

        return new Response(
            JSON.stringify({
                success: true,
                message: `✅ Reservas Confirmadas (${validBookings.length})!\n${msgDetails}`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ success: false, message: 'Server/AI Error: ' + error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
