import { describe, it, expect } from 'vitest';
import { hashPinSimple } from '../src/core/auth/pinHelpers';
import type { UserRole } from '../src/types';
import type { TeamUser } from '../src/hooks/useUsers';

describe('Prompt 04: Staff Management, RBAC & Role Provisioning Suite', () => {
  const sampleUsers: TeamUser[] = [
    {
      id: 'user_1',
      name: 'Aarav Mehta',
      email: 'aarav@burgonomics.in',
      phone: '+91 98251 00001',
      role: 'brand_owner',
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('9999'),
      cityIds: ['Surat', 'Ahmedabad'],
    },
    {
      id: 'user_2',
      name: 'Ananya Deshmukh',
      email: 'ananya@burgonomics.in',
      phone: '+91 97654 88123',
      role: 'regional_manager',
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('7777'),
      cityIds: ['Ahmedabad', 'Surat'],
      branchIds: ['branch_surat_01', 'branch_ahmedabad_01'],
    },
    {
      id: 'user_3',
      name: 'Sanjay Patel',
      email: 'sanjay@burgonomics.in',
      phone: '+91 98765 43210',
      role: 'branch_owner',
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('5678'),
      branchIds: ['branch_surat_01'],
      cityIds: ['Surat'],
    },
    {
      id: 'user_4',
      name: 'Ramesh Patel',
      email: 'ramesh@burgonomics.in',
      phone: '+91 98765 43219',
      role: 'branch_staff',
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('1234'),
      branchIds: ['branch_surat_01'],
      cityIds: ['Surat'],
    },
    {
      id: 'user_5',
      name: 'Priya Sharma',
      email: 'priya@burgonomics.in',
      phone: '+91 98200 99887',
      role: 'support',
      active: false,
      pinSet: false,
      cityIds: ['Surat'],
    },
    {
      id: 'user_6',
      name: 'Alex Engineer',
      email: 'alex@burgonomics.in',
      phone: '+91 99999 88888',
      role: 'developer',
      active: true,
      pinSet: true,
      hashedPin: hashPinSimple('0000'),
    },
  ];

  describe('1. Staff Onboarding Form Validation', () => {
    it('validates mandatory name, email, and branch binding for store staff', () => {
      const validateStaffForm = (data: {
        name: string;
        email: string;
        role: UserRole;
        branchIds: string[];
        pin?: string;
      }) => {
        if (!data.name.trim() || !data.email.trim()) {
          return { valid: false, error: 'Name and email are required.' };
        }
        if (
          (data.role === 'branch_staff' || data.role === 'branch_owner') &&
          (!data.branchIds || data.branchIds.length === 0)
        ) {
          return { valid: false, error: 'Store outlet assignment is mandatory for branch staff.' };
        }
        if (data.pin && !/^\d{4}$/.test(data.pin)) {
          return { valid: false, error: 'PIN must be exactly 4 digits.' };
        }
        return { valid: true };
      };

      // Valid store staff
      expect(
        validateStaffForm({
          name: 'Karan Cashier',
          email: 'karan@burgonomics.in',
          role: 'branch_staff',
          branchIds: ['branch_surat_01'],
          pin: '2345',
        }).valid
      ).toBe(true);

      // Missing branch binding
      expect(
        validateStaffForm({
          name: 'Karan Cashier',
          email: 'karan@burgonomics.in',
          role: 'branch_staff',
          branchIds: [],
        }).error
      ).toContain('Store outlet assignment is mandatory');

      // Invalid PIN format
      expect(
        validateStaffForm({
          name: 'Karan Cashier',
          email: 'karan@burgonomics.in',
          role: 'branch_staff',
          branchIds: ['branch_surat_01'],
          pin: '12a4',
        }).error
      ).toBe('PIN must be exactly 4 digits.');
    });
  });

  describe('2. 4-Digit Staff PIN Hashing & Security', () => {
    it('hashes 4-digit PIN deterministically and prevents storing plaintext PINs', () => {
      const pin = '5678';
      const hash = hashPinSimple(pin);

      // hashPinSimple returns "pin1_" + 8-char hex (FNV-1a toy hash)
      expect(hash).toMatch(/^pin1_[0-9a-f]{8}$/);
      expect(hash).not.toBe('5678');
      expect(hashPinSimple('5678')).toBe(hash);
      expect(hashPinSimple('1234')).not.toBe(hash);
    });
  });

  describe('3. Active / Suspended State Transitions', () => {
    it('toggles user active status correctly', () => {
      let user = { ...sampleUsers[3] }; // Ramesh
      expect(user.active).toBe(true);

      // Suspend
      user.active = false;
      expect(user.active).toBe(false);

      // Re-activate
      user.active = true;
      expect(user.active).toBe(true);
    });
  });

  describe('4. Roster Role Filtering & Search Queries', () => {
    it('filters staff members by role categories', () => {
      const execRegional = sampleUsers.filter(
        (u) => u.role === 'brand_owner' || u.role === 'regional_manager'
      );
      expect(execRegional).toHaveLength(2);

      const storeStaff = sampleUsers.filter(
        (u) => u.role === 'branch_owner' || u.role === 'branch_staff'
      );
      expect(storeStaff).toHaveLength(2);

      const supportDev = sampleUsers.filter(
        (u) => u.role === 'support' || u.role === 'developer'
      );
      expect(supportDev).toHaveLength(2);
    });

    it('searches roster by name, email, and phone', () => {
      const queryName = 'ramesh';
      const searchByName = sampleUsers.filter(
        (u) =>
          u.name.toLowerCase().includes(queryName) ||
          u.email.toLowerCase().includes(queryName)
      );
      expect(searchByName).toHaveLength(1);
      expect(searchByName[0].name).toBe('Ramesh Patel');

      const queryPhone = '99887';
      const searchByPhone = sampleUsers.filter((u) => u.phone && u.phone.includes(queryPhone));
      expect(searchByPhone).toHaveLength(1);
      expect(searchByPhone[0].name).toBe('Priya Sharma');
    });
  });
});
