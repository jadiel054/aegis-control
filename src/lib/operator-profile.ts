import { getSql } from './db';

export interface OperatorProfile {
  id: string;
  operator_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  avatar_initials: string;
  avatar_color: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get operator profile from database
 */
export async function getOperatorProfile(operatorId: string): Promise<OperatorProfile | null> {
  try {
    const sql = getSql();
    const rows = await sql`
      SELECT * FROM operator_profiles 
      WHERE operator_id = ${operatorId} 
      LIMIT 1
    `;
    return rows[0] as OperatorProfile || null;
  } catch (error) {
    console.error('Failed to get operator profile:', error);
    return null;
  }
}

/**
 * Create or update operator profile
 */
export async function saveOperatorProfile(
  operatorId: string,
  profile: {
    display_name: string;
    email: string;
    avatar_url?: string | null;
    avatar_initials: string;
    avatar_color: string;
  }
): Promise<OperatorProfile> {
  const sql = getSql();
  
  // Check if profile exists
  const existing = await sql`
    SELECT id FROM operator_profiles 
    WHERE operator_id = ${operatorId} 
    LIMIT 1
  `;
  
  if (existing[0]) {
    // Update existing profile
    const updated = await sql`
      UPDATE operator_profiles 
      SET 
        display_name = ${profile.display_name},
        email = ${profile.email},
        avatar_url = ${profile.avatar_url || null},
        avatar_initials = ${profile.avatar_initials},
        avatar_color = ${profile.avatar_color},
        updated_at = NOW()
      WHERE operator_id = ${operatorId}
      RETURNING *
    `;
    return updated[0] as OperatorProfile;
  } else {
    // Create new profile
    const created = await sql`
      INSERT INTO operator_profiles 
        (operator_id, display_name, email, avatar_url, avatar_initials, avatar_color, created_at, updated_at)
      VALUES 
        (${operatorId}, ${profile.display_name}, ${profile.email}, ${profile.avatar_url || null}, ${profile.avatar_initials}, ${profile.avatar_color}, NOW(), NOW())
      RETURNING *
    `;
    return created[0] as OperatorProfile;
  }
}

/**
 * Get initials from display name
 * Improved logic: handles multiple words, special characters, and edge cases
 */
export function getInitialsFromName(name: string): string {
  if (!name || !name.trim()) {
    return 'AO';
  }
  
  // Clean the name: remove special characters and extra spaces
  const cleaned = name.trim().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ');
  const parts = cleaned.split(' ');
  
  // If only one word, take first 2 letters
  if (parts.length === 1) {
    const word = parts[0];
    if (word.length >= 2) {
      return word.slice(0, 2).toUpperCase();
    }
    return word.toUpperCase().padEnd(2, word[0] || 'A');
  }
  
  // Multiple words: take first letter of first and last word
  const firstInitial = parts[0][0]?.toUpperCase() || 'A';
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase() || 'O';
  
  return firstInitial + lastInitial;
}

/**
 * Generate a default avatar color based on display name hash
 */
export function getDefaultAvatarColor(name: string): string {
  const colors = [
    'bg-cyan-500',
    'bg-emerald-500',
    'bg-amber-500',
    'bg-purple-500',
    'bg-rose-500',
    'bg-indigo-500',
    'bg-teal-500',
    'bg-pink-500',
  ];
  
  if (!name || !name.trim()) {
    return colors[0];
  }
  
  // Simple hash based on name
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get operator ID from session
 * For now, we use a default operator ID since auth is cookie-based
 */
export function getOperatorId(): string {
  // In a real implementation, this would come from the session
  // For now, use a default operator ID
  return 'default-operator';
}

/**
 * Initialize operator profile with defaults
 */
export async function initializeOperatorProfile(operatorId: string): Promise<OperatorProfile> {
  const defaultProfile = {
    display_name: 'Aegis Operator',
    email: 'operator@aegis.internal',
    avatar_url: null,
    avatar_initials: 'AO',
    avatar_color: 'bg-cyan-500',
  };
  
  return saveOperatorProfile(operatorId, defaultProfile);
}
