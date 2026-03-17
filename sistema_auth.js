/**
 * Sistema Auth - Balneário Rio Preto
 * Autenticação por PIN para funcionários
 */
import { supabase } from './scripts.js';

const SESSION_KEY = 'riopreto_staff_session';
const SESSION_TIMEOUT = 12 * 60 * 60 * 1000; // 12 horas

// ====== HASH ======
async function hashPin(pin) {
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
    caixa: 'Caixa',
    garcom: 'Garçom',
    bar: 'Bar',
    cozinha: 'Cozinha',
    portaria: 'Portaria'
};

export const ROLE_COLORS = {
    admin: 'bg-purple-100 text-purple-700',
    caixa: 'bg-blue-100 text-blue-700',
    garcom: 'bg-green-100 text-green-700',
    bar: 'bg-amber-100 text-amber-700',
    cozinha: 'bg-red-100 text-red-700',
    portaria: 'bg-cyan-100 text-cyan-700'
};
