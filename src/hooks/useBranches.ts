import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import {
  collection,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import type { Branch, FutureStoreInput } from '@/types';

export interface CreateBranchInput {
  name: string;
  city: string;
  address: string;
  phone: string;
  status: 'active' | 'coming_soon' | 'paused';
  expectedLaunchDate?: string;
  bannerImage?: string;
  petpoojaStoreId?: string;
  razorpayAccountId?: string;
  brandRoyaltyPercent?: number;
  deliveryRadiusKm?: number;
  prepTimeMinutes?: number;
  operatingHours?: { open: string; close: string };
  coordinates?: { lat: number; lng: number };
  allowComingSoonSubscribers?: boolean;
}

export function useBranches() {
  const queryClient = useQueryClient();

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => {
      try {
        const branchesSnap = await getDocs(collection(db, 'branches'));
        const list = branchesSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Branch[];

        if (list.length > 0) return list;
        // Empty backend in production ⇒ no outlets (never seed fakes).
        if (!import.meta.env.DEV) return [];
      } catch (err) {
        console.warn('Error fetching branches from Firestore:', err);
      }

      // Dev-only seed branches (Runbook §8) — production shows no outlets
      // rather than invented ones when the backend is empty/unreachable.
      if (!import.meta.env.DEV) return [];

      return [
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
          deliveryRadiusKm: 7,
          razorpayAccountId: 'acc_Rzp_Surat_01',
          brandRoyaltyPercent: 5.0,
          announcementBanner: '🔥 Weekend Special: Flat 20% off Gourmet Burgers!',
          petpoojaStoreId: 'PP_SURAT_01',
          coordinates: { lat: 21.1959, lng: 72.7933 },
          operatingHours: { open: '11:00 AM', close: '11:30 PM' },
          createdAt: Timestamp.now(),
        },
        {
          id: 'branch_ahmedabad_01',
          name: 'Burgonomics Ahmedabad SG Highway Flagship',
          city: 'Ahmedabad',
          address: 'Ground Floor, Titanium Square, Thaltej',
          phone: '+91 98765 43211',
          active: true,
          status: 'active',
          acceptingOrdersStatus: 'open',
          prepTimeMinutes: 25,
          deliveryRadiusKm: 8,
          razorpayAccountId: 'acc_Rzp_Ahmd_01',
          brandRoyaltyPercent: 5.0,
          petpoojaStoreId: 'PP_AMD_01',
          coordinates: { lat: 23.0525, lng: 72.512 },
          operatingHours: { open: '11:00 AM', close: '11:30 PM' },
          createdAt: Timestamp.now(),
        },
        {
          id: 'branch_vadodara_future',
          name: 'Burgonomics Vadodara Alkapuri',
          city: 'Vadodara',
          address: 'RC Dutt Road, Alkapuri',
          phone: '+91 98765 43212',
          active: false,
          status: 'coming_soon',
          expectedLaunchDate: 'October 2026',
          bannerImage:
            'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&auto=format&fit=crop&q=80',
          allowComingSoonSubscribers: true,
          subscribersCount: 142,
          razorpayAccountId: 'acc_Rzp_Vdr_01',
          brandRoyaltyPercent: 5.0,
          coordinates: { lat: 22.3106, lng: 73.1695 },
          createdAt: Timestamp.now(),
        },
      ];
    },
  });

  const createBranch = useMutation({
    mutationFn: async (branchInput: CreateBranchInput) => {
      const branchRef = collection(db, 'branches');
      return addDoc(branchRef, {
        name: branchInput.name,
        city: branchInput.city,
        address: branchInput.address,
        phone: branchInput.phone,
        active: branchInput.status === 'active',
        status: branchInput.status,
        expectedLaunchDate: branchInput.expectedLaunchDate || null,
        bannerImage: branchInput.bannerImage || null,
        petpoojaStoreId: branchInput.petpoojaStoreId || null,
        razorpayAccountId: branchInput.razorpayAccountId || `acc_Rzp_${Date.now().toString().slice(-6)}`,
        brandRoyaltyPercent: branchInput.brandRoyaltyPercent || 5.0,
        deliveryRadiusKm: branchInput.deliveryRadiusKm || 7,
        prepTimeMinutes: branchInput.prepTimeMinutes || 20,
        operatingHours: branchInput.operatingHours || { open: '11:00 AM', close: '11:30 PM' },
        allowComingSoonSubscribers: branchInput.allowComingSoonSubscribers ?? true,
        subscribersCount: 0,
        coordinates: branchInput.coordinates || {
          lat: 21.1702,
          lng: 72.8311,
        },
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const createFutureStore = useMutation({
    mutationFn: async (storeInput: FutureStoreInput) => {
      return createBranch.mutateAsync({
        name: storeInput.name,
        city: storeInput.city,
        address: storeInput.address,
        phone: storeInput.phone || '',
        status: 'coming_soon',
        expectedLaunchDate: storeInput.expectedLaunchDate,
        bannerImage: storeInput.bannerImage,
        petpoojaStoreId: storeInput.petpoojaStoreId,
        allowComingSoonSubscribers: storeInput.allowComingSoonSubscribers,
        coordinates: {
          lat: storeInput.lat || 21.1702,
          lng: storeInput.lng || 72.8311,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const broadcastLaunchAlert = useMutation({
    mutationFn: async ({
      branchId,
      branchName,
      title,
      body,
    }: {
      branchId: string;
      branchName: string;
      title: string;
      body: string;
    }) => {
      // Record announcement in Firestore
      await addDoc(collection(db, 'branch_announcements'), {
        branchId,
        branchName,
        title,
        body,
        targetTopic: `upcoming_${branchId}`,
        createdAt: Timestamp.now(),
      });
      // Loop 5: the record alone notifies nobody — fan out over FCM and
      // fail LOUD when the server refuses, so staff never celebrate an
      // unsent broadcast. The doc above remains as the audit record.
      const { partnerFunctionsApi } = await import('@/services/partnerFunctionsApi');
      const result = await partnerFunctionsApi.broadcastToTopic({
        topic: `upcoming_${branchId}`,
        title,
        body,
      });
      if (!result?.success) {
        throw new Error('Announcement recorded, but push fan-out was refused by the server — subscribers were NOT notified.');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const activateStore = useMutation({
    mutationFn: async ({
      branchId,
      petpoojaStoreId,
      razorpayAccountId,
    }: {
      branchId: string;
      petpoojaStoreId?: string;
      razorpayAccountId?: string;
    }) => {
      const branchRef = doc(db, 'branches', branchId);
      const updateData: Record<string, any> = {
        active: true,
        status: 'active',
        updatedAt: Timestamp.now(),
      };
      if (petpoojaStoreId) updateData.petpoojaStoreId = petpoojaStoreId;
      if (razorpayAccountId) updateData.razorpayAccountId = razorpayAccountId;

      await updateDoc(branchRef, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const updateBranchSettings = useMutation({
    mutationFn: async ({
      branchId,
      settings,
    }: {
      branchId: string;
      settings: Partial<Branch>;
    }) => {
      const branchRef = doc(db, 'branches', branchId);
      await updateDoc(branchRef, {
        ...settings,
        updatedAt: Timestamp.now(),
      }).catch(async () => {
        await setDoc(branchRef, { ...settings, updatedAt: Timestamp.now() }, { merge: true });
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  const toggleBranchStatus = useMutation({
    mutationFn: async ({ branchId, active }: { branchId: string; active: boolean }) => {
      const branchRef = doc(db, 'branches', branchId);
      await updateDoc(branchRef, {
        active,
        status: active ? 'active' : 'inactive',
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['branches'] });
    },
  });

  return {
    branches,
    isLoading,
    createBranch,
    createFutureStore,
    broadcastLaunchAlert,
    activateStore,
    updateBranchSettings,
    toggleBranchStatus,
  };
}
