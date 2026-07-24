/**
 * Sistema Auth - Balneário Rio Preto
 * Autenticação por PIN para funcionários
 */
import { supabase } from './scripts.js';

const SESSION_KEY = 'riopreto_staff_session';
const SESSION_TIMEOUT = 12 * 60 * 60 * 1000; // 12 horas

// ====== HASH ======
export async function hashPin(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin.toString().trim());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ====== LOGIN ======
export async function loginStaff(pin) {
    const pinHash = await hashPin(pin);
    
    const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('pin_hash', pinHash)
        .eq('is_active', true)
        .single();
    
    if (error || !data) {
        return { success: false, error: 'PIN inválido ou usuário inativo' };
    }
    
    const session = {
        id: data.id,
        name: data.name,
        role: data.role,
        loginAt: Date.now()
    };
    
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    
    // Log Audit Event
    try {
        import('./audit_logger.js').then(({ logAuditAction }) => {
            logAuditAction('STAFF_LOGIN', { staff_name: data.name, role: data.role });
        }).catch(() => {});
    } catch(e) {}

    return { success: true, user: session };
}

// ====== SESSION ======
export function getCurrentStaff() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        
        const session = JSON.parse(raw);
        
        // Check timeout
        if (Date.now() - session.loginAt > SESSION_TIMEOUT) {
            logoutStaff();
            return null;
        }
        
        return session;
    } catch {
        return null;
    }
}

export function logoutStaff() {
    localStorage.removeItem(SESSION_KEY);
}

// ====== ROLE CHECK ======
export function requireRole(allowedRoles) {
    const staff = getCurrentStaff();
    if (!staff) return false;
    if (allowedRoles.includes('any')) return true;
    return allowedRoles.includes(staff.role);
}

// ====== STAFF MANAGEMENT ======
export async function createStaffUser(name, pin, role) {
    const pinHash = await hashPin(pin);
    
    const { data, error } = await supabase
        .from('staff_users')
        .insert({ name, pin_hash: pinHash, role })
        .select()
        .single();
    
    if (error) return { success: false, error: error.message };
    return { success: true, user: data };
}

export async function listStaff() {
    const { data, error } = await supabase
        .from('staff_users')
        .select('id, name, role, is_active, created_at')
        .order('name');
    
    return data || [];
}

export async function toggleStaff(id, isActive) {
    const { error } = await supabase
        .from('staff_users')
        .update({ is_active: isActive })
        .eq('id', id);
    
    return !error;
}

export async function updateStaffPin(id, newPin) {
    const pinHash = await hashPin(newPin);
    const { error } = await supabase
        .from('staff_users')
        .update({ pin_hash: pinHash })
        .eq('id', id);
    
    return !error;
}

// ====== ROLE LABELS ======
export const ROLE_LABELS = {
    admin: 'Administrador',
    gerente: 'Gerente',
    ceo: 'CEO',
    caixa: 'Caixa',
    garcom: 'Garçom',
    bar: 'Bar',
    balcao: 'Balcão / PDV',
    cozinha: 'Cozinha',
    portaria: 'Portaria',
    marketing: 'Marketing'
};

export const ROLE_COLORS = {
    admin: 'bg-purple-100 text-purple-700',
    gerente: 'bg-purple-100 text-purple-700',
    ceo: 'bg-indigo-100 text-indigo-700',
    caixa: 'bg-blue-100 text-blue-700',
    garcom: 'bg-green-100 text-green-700',
    bar: 'bg-amber-100 text-amber-700',
    balcao: 'bg-orange-100 text-orange-700',
    cozinha: 'bg-red-100 text-red-700',
    portaria: 'bg-cyan-100 text-cyan-700',
    marketing: 'bg-pink-100 text-pink-700'
};

// All roles that are allowed to log into the sistema panel
export const ALLOWED_SISTEMA_ROLES = [
    'admin', 'gerente', 'ceo', 'caixa', 'garcom', 'bar', 'balcao', 'cozinha', 'portaria', 'marketing'
];

// ====== ROLE PERMISSIONS MATRIX ======
export const ALL_SYSTEM_MODULES = [
    { id: 'dashboard', label: 'Visão Geral (Dashboard)', icon: 'chart-pie' },
    { id: 'comandas', label: 'Comandas (Mesas/Chalés)', icon: 'receipt' },
    { id: 'pdv', label: 'PDV (Balcão)', icon: 'cash-register' },
    { id: 'portaria', label: 'Portaria & Visitantes', icon: 'door-open' },
    { id: 'estoque', label: 'Estoque de Produtos', icon: 'boxes-stacked' },
    { id: 'funcionarios', label: 'Gestão de Equipe (Staff)', icon: 'users' },
    { id: 'fechamento_semanal', label: 'Relatórios e Fechamento', icon: 'file-csv' },
    { id: 'impressoes', label: 'Imprimir Imagens/Fotos', icon: 'print' },
    { id: 'permissoes', label: 'Permissões de Cargos (Exclusivo CEO)', icon: 'user-shield' }
];

export const ALL_SYSTEM_ACTIONS = [
    { id: 'cancel_items', label: 'Cancelar / Remover Itens de Comandas', desc: 'Permite estornar ou cancelar lançamentos já confirmados' },
    { id: 'apply_discounts', label: 'Aplicar Descontos em Vendas', desc: 'Permite conceder descontos em pagamentos do caixa' },
    { id: 'edit_stock', label: 'Alterar e Adicionar Estoque', desc: 'Permite modificar quantidades, preços e cadastrar produtos' },
    { id: 'manage_staff', label: 'Gerenciar Usuários e PINs da Equipe', desc: 'Permite criar, editar cargos e trocar PINs de funcionários' },
    { id: 'close_cashier', label: 'Fechar Caixa e Gerar Relatórios', desc: 'Permite a extração e encerramento de caixa semanal/diário' },
    { id: 'gate_control', label: 'Operar Entrada e Saída de Portaria', desc: 'Permite registrar visitantes e cobranças de Day Use' }
];

export const DEFAULT_ROLE_PERMISSIONS = {
    ceo: {
        modules: ['dashboard', 'comandas', 'pdv', 'portaria', 'estoque', 'funcionarios', 'fechamento_semanal', 'impressoes', 'permissoes'],
        actions: ['cancel_items', 'apply_discounts', 'edit_stock', 'manage_staff', 'close_cashier', 'gate_control']
    },
    admin: {
        modules: ['dashboard', 'comandas', 'pdv', 'portaria', 'estoque', 'funcionarios', 'fechamento_semanal', 'impressoes', 'permissoes'],
        actions: ['cancel_items', 'apply_discounts', 'edit_stock', 'manage_staff', 'close_cashier', 'gate_control']
    },
    gerente: {
        modules: ['dashboard', 'comandas', 'pdv', 'portaria', 'estoque', 'funcionarios', 'fechamento_semanal', 'impressoes'],
        actions: ['cancel_items', 'apply_discounts', 'edit_stock', 'manage_staff', 'close_cashier', 'gate_control']
    },
    caixa: {
        modules: ['comandas', 'pdv', 'impressoes'],
        actions: ['apply_discounts', 'close_cashier']
    },
    garcom: {
        modules: ['comandas'],
        actions: []
    },
    bar: {
        modules: ['pdv'],
        actions: []
    },
    balcao: {
        modules: ['pdv'],
        actions: []
    },
    cozinha: {
        modules: ['comandas'],
        actions: []
    },
    portaria: {
        modules: ['portaria'],
        actions: ['gate_control']
    },
    marketing: {
        modules: ['dashboard'],
        actions: []
    }
};

const PERMISSIONS_KEY = 'riopreto_role_permissions';

export function getRolePermissions() {
    try {
        const raw = localStorage.getItem(PERMISSIONS_KEY);
        if (!raw) return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
        const saved = JSON.parse(raw);
        const merged = { ...DEFAULT_ROLE_PERMISSIONS, ...saved };
        merged.ceo = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS.ceo)); // CEO permissions always locked to full access
        return merged;
    } catch (e) {
        return JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS));
    }
}

export function saveRolePermissions(permissionsMap) {
    try {
        const toSave = { ...permissionsMap };
        toSave.ceo = JSON.parse(JSON.stringify(DEFAULT_ROLE_PERMISSIONS.ceo));
        localStorage.setItem(PERMISSIONS_KEY, JSON.stringify(toSave));
        return true;
    } catch (e) {
        console.error('Error saving role permissions:', e);
        return false;
    }
}

export function hasModulePermission(role, moduleKey) {
    if (!role) return false;
    if (role === 'ceo') return true;
    const perms = getRolePermissions();
    const rolePerms = perms[role] || DEFAULT_ROLE_PERMISSIONS[role];
    if (!rolePerms || !rolePerms.modules) return false;
    return rolePerms.modules.includes(moduleKey);
}

export function hasActionPermission(role, actionKey) {
    if (!role) return false;
    if (role === 'ceo') return true;
    const perms = getRolePermissions();
    const rolePerms = perms[role] || DEFAULT_ROLE_PERMISSIONS[role];
    if (!rolePerms || !rolePerms.actions) return false;
    return rolePerms.actions.includes(actionKey);
}


