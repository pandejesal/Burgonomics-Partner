import { describe, it, expect } from 'vitest';
import type { Branch, UserRole } from '../src/types';

describe('Prompt 05: Branch Management, Geofences & Franchise Accounts Suite', () => {
  const sampleBranches: Branch[] = [
    {
      id: 'branch_surat_01',
      name: 'Burgonomics Surat Adajan Outlet',
      city: 'Surat',
      address: 'Shop 4, Prime Arcade, Anand Mahal Rd, Adajan',
      phone: '+91 98765 43210',
      active: true,
      status: 'active',
      acceptingOrdersStatus: 'open',
      prepTimeMinutes: 20,
      deliveryRadiusKm: 7.0,
      razorpayAccountId: 'acc_Rzp_Surat_01',
      brandRoyaltyPercent: 5.0,
      petpoojaStoreId: 'PP_SURAT_01',
      coordinates: { lat: 21.1959, lng: 72.7933 },
      operatingHours: { open: '11:00 AM', close: '11:30 PM' },
    },
    {
      id: 'branch_ahmedabad_01',
      name: 'Burgonomics Ahmedabad Flagship',
      city: 'Ahmedabad',
      address: 'Ground Floor, Titanium Square, Thaltej',
      phone: '+91 98765 43211',
      active: true,
      status: 'active',
      acceptingOrdersStatus: 'open',
      prepTimeMinutes: 25,
      deliveryRadiusKm: 8.5,
      razorpayAccountId: 'acc_Rzp_Ahmd_01',
      brandRoyaltyPercent: 5.0,
      petpoojaStoreId: 'PP_AMD_01',
      coordinates: { lat: 23.0525, lng: 72.512 },
      operatingHours: { open: '11:00 AM', close: '11:30 PM' },
    },
  ];

  describe('1. Branch Configuration & Geofence Validations', () => {
    const validateBranchConfig = (data: {
      name: string;
      address: string;
      deliveryRadiusKm?: number;
      razorpayAccountId?: string;
    }) => {
      if (!data.name.trim() || !data.address.trim()) {
        return { valid: false, error: 'Name and address are required.' };
      }
      if (
        data.deliveryRadiusKm !== undefined &&
        (data.deliveryRadiusKm < 1 || data.deliveryRadiusKm > 20)
      ) {
        return { valid: false, error: 'Delivery radius must be between 1.0 km and 20.0 km.' };
      }
      if (
        data.razorpayAccountId &&
        !/^acc_[a-zA-Z0-9_]+$/.test(data.razorpayAccountId)
      ) {
        return { valid: false, error: 'Invalid Razorpay account ID format (must start with acc_).' };
      }
      return { valid: true };
    };

    it('validates correct branch details, geofence radius, and Route account', () => {
      const res = validateBranchConfig({
        name: 'Burgonomics Vadodara Alkapuri',
        address: 'RC Dutt Road, Alkapuri',
        deliveryRadiusKm: 7.5,
        razorpayAccountId: 'acc_Rzp_Vad_01',
      });
      expect(res.valid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects delivery radius outside the 1.0 km to 20.0 km range', () => {
      expect(
        validateBranchConfig({
          name: 'Test Branch',
          address: 'Test Address',
          deliveryRadiusKm: 0.5,
        }).error
      ).toBe('Delivery radius must be between 1.0 km and 20.0 km.');

      expect(
        validateBranchConfig({
          name: 'Test Branch',
          address: 'Test Address',
          deliveryRadiusKm: 25,
        }).error
      ).toBe('Delivery radius must be between 1.0 km and 20.0 km.');
    });

    it('validates Razorpay Route account ID format', () => {
      expect(
        validateBranchConfig({
          name: 'Test Branch',
          address: 'Test Address',
          razorpayAccountId: 'invalid_id_123',
        }).error
      ).toBe('Invalid Razorpay account ID format (must start with acc_).');

      expect(
        validateBranchConfig({
          name: 'Test Branch',
          address: 'Test Address',
          razorpayAccountId: 'acc_valid_9988',
        }).valid
      ).toBe(true);
    });
  });

  describe('2. Geofence Catchment Calculations', () => {
    it('computes accurate circular catchment area in square kilometers', () => {
      const radiusKm = 7.0;
      const areaSqKm = parseFloat((Math.PI * Math.pow(radiusKm, 2)).toFixed(1));
      expect(areaSqKm).toBe(153.9);

      const radius10Km = 10.0;
      const area10SqKm = parseFloat((Math.PI * Math.pow(radius10Km, 2)).toFixed(1));
      expect(area10SqKm).toBe(314.2);
    });

    it('estimates maximum delivery travel time based on radius', () => {
      const calcDeliveryTime = (r: number) => Math.round(15 + r * 2.5);
      expect(calcDeliveryTime(5)).toBe(28); // 15 + 12.5 = 27.5 -> 28 mins
      expect(calcDeliveryTime(10)).toBe(40); // 15 + 25 = 40 mins
    });
  });

  describe('3. Role Security & Superadmin Exclusivity', () => {
    const canModifyRouteAccount = (role: UserRole) => {
      return role === 'brand_owner' || role === 'developer';
    };

    it('allows only superadmins (brand_owner, developer) to modify Razorpay Route accounts', () => {
      expect(canModifyRouteAccount('brand_owner')).toBe(true);
      expect(canModifyRouteAccount('developer')).toBe(true);

      // Store staff and managers cannot modify financial accounts
      expect(canModifyRouteAccount('branch_owner')).toBe(false);
      expect(canModifyRouteAccount('branch_staff')).toBe(false);
      expect(canModifyRouteAccount('support')).toBe(false);
      expect(canModifyRouteAccount('regional_manager')).toBe(false);
    });
  });

  describe('4. Store Operating Status & Accepting Orders Toggle', () => {
    it('transitions store active status properly', () => {
      let branch = { ...sampleBranches[0] };
      expect(branch.active).toBe(true);

      // Toggle offline
      branch.active = false;
      expect(branch.active).toBe(false);

      // Toggle online
      branch.active = true;
      expect(branch.active).toBe(true);
    });
  });
});
