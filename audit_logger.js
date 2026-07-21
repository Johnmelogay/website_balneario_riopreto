/**
 * Audit Logger Helper - Balneário Rio Preto
 * Módulo ultra-leve de auditoria e rastreamento de ações.
 * Registra quem, quando, onde, qual aparelho e os detalhes de cada ação.
 * Funciona de forma assíncrona (não-bloqueante) para não afetar a velocidade do app.
 */
import { supabase } from './scripts.js';
import { getCurrentStaff } from './sistema_auth.js';

// Detecta informações do dispositivo do usuário
function getDeviceInfo() {
    const ua = navigator.userAgent || '';
    let device = 'Desktop';
    if (/mobile/i.test(ua)) device = 'Mobile';
    if (/tablet|ipad/i.test(ua)) device = 'Tablet';

    let os = 'Desconhecido';
    if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
    else if (/Android/i.test(ua)) os = 'Android';
    else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
    else if (/Windows/i.test(ua)) os = 'Windows';
    else if (/Linux/i.test(ua)) os = 'Linux';

    let browser = 'Navegador';
    if (/chrome|crios/i.test(ua) && !/edge|edg/i.test(ua)) browser = 'Chrome';
    else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) browser = 'Safari';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/edge|edg/i.test(ua)) browser = 'Edge';

    return {
        device,
        os,
        browser,
        screen: `${window.innerWidth}x${window.innerHeight}`,
        ua: ua.slice(0, 150) // Truncado para manter leve
    };
}

/**
 * Registra uma ação de auditoria no Supabase.
 * @param {string} actionType - Tipo da ação (ex: 'ORDER_CREATED', 'STATUS_CHANGED', 'STOCK_UPDATED', 'STAFF_LOGIN', 'PAYMENT_CLOSED')
 * @param {Object} details - Detalhes específicos da ação (número do pedido, prato, valores, etc.)
 * @param {Object} location - Localização opcional { type: 'chale', id: '1' }
 */
export async function logAuditAction(actionType, details = {}, location = null) {
    try {
        const staff = getCurrentStaff();
        const deviceInfo = getDeviceInfo();

        const locType = location?.type || window.currentLocationType || null;
        const locId = location?.id || window.currentLocationId || null;

        // Inserção assíncrona em segundo plano
        const { error } = await supabase
            .from('audit_logs')
            .insert({
                action_type: actionType,
                staff_id: staff?.id || null,
                staff_name: staff?.name || 'Sistema/Anônimo',
                staff_role: staff?.role || 'desconhecido',
                location_type: locType,
                location_id: locId,
                device_info: deviceInfo,
                details: details
            });

        if (error) {
            console.warn('Erro ao salvar log de auditoria:', error.message);
        }
    } catch (err) {
        // Falha silenciosa para não travar o fluxo principal do usuário
        console.warn('Erro inesperado no audit logger:', err);
    }
}
