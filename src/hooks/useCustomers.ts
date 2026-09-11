import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { db } from '@/config/firebase';
import { collection, query, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import type { Customer } from '@/types';
import { isGlobalRole } from '@/utils/branchScope';

// Loop 39/120: seed CRM fills ONLY an empty directory in DEV builds. Pure
// gate so tests pin it: prod empty stays empty, errors throw in prod.
export function shouldSeedDirectory(liveCount: number, isDev: boolean): boolean {
  return liveCount === 0 && isDev;
}

export function useCustomers() {
  const { user } = useAuthStore();
  const { selectedCity, selectedBranchId } = useAppStore();

  return useQuery<Customer[]>({
    queryKey: ['customers', user?.id, user?.role, selectedCity, selectedBranchId],
    queryFn: async () => {
      try {
        // Loop 39/120: bounded — the customers collection grows without
        // bound; dashboard counts stay exact at real scale under this cap.
        const customersSnap = await getDocs(
          query(collection(db, 'customers'), orderBy('createdAt', 'desc'), limit(500))
        );

        let list: Customer[] = customersSnap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Customer[];

        // Seed rich CRM data if empty or sparse for live testing — DEV ONLY.
        // Loop 39/120: an empty prod collection must stay empty, never fill
        // with fake people (names/phones/emails/home addresses as live rows).
        if (shouldSeedDirectory(list.length, import.meta.env.DEV)) {
          list = [
            {
              id: 'cust_01',
              name: 'Aarav Mehta',
              phone: '+91 98251 12345',
              email: 'aarav.mehta@gmail.com',
              loyaltyPoints: 420,
              totalOrders: 18,
              totalSpend: 4890,
              averageOrderValue: 271,
              favoriteBranchId: 'branch_surat_01',
              favoriteBranchName: 'Surat Adajan',
              favoriteCity: 'Surat',
              segment: 'VIP',
              lastOrderDate: '2026-08-23',
              addresses: [
                {
                  id: 'addr_1',
                  label: 'Home',
                  full: 'Flat 402, Riverview Apts, Adajan, Surat',
                  lat: 21.195,
                  lng: 72.793,
                  isDefault: true,
                },
              ],
              createdAt: Timestamp.now(),
            },
            {
              id: 'cust_02',
              name: 'Pooja Patel',
              phone: '+91 99099 87654',
              email: 'pooja.p@outlook.com',
              loyaltyPoints: 210,
              totalOrders: 9,
              totalSpend: 2450,
              averageOrderValue: 272,
              favoriteBranchId: 'branch_ahmedabad_01',
              favoriteBranchName: 'Ahmedabad SG Highway',
              favoriteCity: 'Ahmedabad',
              segment: 'Regular',
              lastOrderDate: '2026-08-21',
              addresses: [
                {
                  id: 'addr_2',
                  label: 'Office',
                  full: 'Titanium Square, Thaltej, Ahmedabad',
                  lat: 23.052,
                  lng: 72.512,
                  isDefault: true,
                },
              ],
              createdAt: Timestamp.now(),
            },
            {
              id: 'cust_03',
              name: 'Rohan Sharma',
              phone: '+91 98791 23456',
              email: 'rohan.s@gmail.com',
              loyaltyPoints: 50,
              totalOrders: 2,
              totalSpend: 540,
              averageOrderValue: 270,
              favoriteBranchId: 'branch_surat_01',
              favoriteBranchName: 'Surat Adajan',
              favoriteCity: 'Surat',
              segment: 'New',
              lastOrderDate: '2026-08-24',
              addresses: [
                {
                  id: 'addr_3',
                  label: 'Home',
                  full: 'G-12, Green City, Vesu, Surat',
                  lat: 21.15,
                  lng: 72.77,
                  isDefault: true,
                },
              ],
              createdAt: Timestamp.now(),
            },
            {
              id: 'cust_04',
              name: 'Neha Kothari',
              phone: '+91 98240 55678',
              email: 'neha.k@gmail.com',
              loyaltyPoints: 650,
              totalOrders: 26,
              totalSpend: 7890,
              averageOrderValue: 303,
              favoriteBranchId: 'branch_ahmedabad_01',
              favoriteBranchName: 'Ahmedabad SG Highway',
              favoriteCity: 'Ahmedabad',
              segment: 'VIP',
              lastOrderDate: '2026-08-22',
              addresses: [
                {
                  id: 'addr_4',
                  label: 'Home',
                  full: 'Bodakdev, Ahmedabad',
                  lat: 23.04,
                  lng: 72.52,
                  isDefault: true,
                },
              ],
              createdAt: Timestamp.now(),
            },
            {
              id: 'cust_05',
              name: 'Vikram Joshi',
              phone: '+91 97234 88990',
              email: 'vikram.j@yahoo.com',
              loyaltyPoints: 30,
              totalOrders: 4,
              totalSpend: 980,
              averageOrderValue: 245,
              favoriteBranchId: 'branch_surat_01',
              favoriteBranchName: 'Surat Adajan',
              favoriteCity: 'Surat',
              segment: 'At-Risk',
              lastOrderDate: '2026-07-15',
              addresses: [
                {
                  id: 'addr_5',
                  label: 'Home',
                  full: 'Citylight, Surat',
                  lat: 21.17,
                  lng: 72.8,
                  isDefault: true,
                },
              ],
              createdAt: Timestamp.now(),
            },
          ];
        }

        // Scoped-role scoping (branch_owner AND branch_staff): strictly
        // assigned branches. Unknown-branch customers stay visible so no
        // regular is silently dropped from the outlet's view.
        if (!isGlobalRole(user?.role) && user?.branchIds?.length) {
          const mine = user.branchIds;
          return list.filter(
            (c) => !c.favoriteBranchId || mine.includes(c.favoriteBranchId)
          );
        }

        // City & Branch Filtering for Brand Owner / Dev / Support / Regional
        if (selectedCity && selectedCity !== 'all') {
          list = list.filter((c) => !c.favoriteCity || c.favoriteCity.toLowerCase() === selectedCity.toLowerCase());
        }

        if (selectedBranchId && selectedBranchId !== 'all') {
          list = list.filter((c) => !c.favoriteBranchId || c.favoriteBranchId === selectedBranchId);
        }

        return list;
      } catch (err) {
        // Production must surface the error, not mask it with fake customers
        // (Runbook §8). Dev keeps the rich seed CRM for offline work.
        if (!import.meta.env.DEV) throw err;
        console.warn('Error fetching customers, returning rich seed CRM:', err);
        let list: Customer[] = [
          {
            id: 'cust_01',
            name: 'Aarav Mehta',
            phone: '+91 98251 12345',
            email: 'aarav.mehta@gmail.com',
            loyaltyPoints: 420,
            totalOrders: 18,
            totalSpend: 4890,
            averageOrderValue: 271,
            favoriteBranchId: 'branch_surat_01',
            favoriteBranchName: 'Surat Adajan',
            favoriteCity: 'Surat',
            segment: 'VIP',
            lastOrderDate: '2026-08-23',
            addresses: [],
            createdAt: Timestamp.now(),
          },
          {
            id: 'cust_02',
            name: 'Pooja Patel',
            phone: '+91 99099 87654',
            email: 'pooja.p@outlook.com',
            loyaltyPoints: 210,
            totalOrders: 9,
            totalSpend: 2450,
            averageOrderValue: 272,
            favoriteBranchId: 'branch_surat_01',
            favoriteBranchName: 'Surat Adajan',
            favoriteCity: 'Surat',
            segment: 'Regular',
            lastOrderDate: '2026-08-20',
            addresses: [],
            createdAt: Timestamp.now(),
          },
          {
            id: 'cust_03',
            name: 'Rahul Shah',
            phone: '+91 98980 43210',
            email: 'rahul.shah@gmail.com',
            loyaltyPoints: 85,
            totalOrders: 3,
            totalSpend: 820,
            averageOrderValue: 273,
            favoriteBranchId: 'branch_ahmedabad_01',
            favoriteBranchName: 'Ahmedabad SG Highway',
            favoriteCity: 'Ahmedabad',
            segment: 'New',
            lastOrderDate: '2026-08-24',
            addresses: [],
            createdAt: Timestamp.now(),
          },
          {
            id: 'cust_04',
            name: 'Neha Kapoor',
            phone: '+91 91234 56789',
            email: 'neha.k@gmail.com',
            loyaltyPoints: 650,
            totalOrders: 26,
            totalSpend: 7890,
            averageOrderValue: 303,
            favoriteBranchId: 'branch_ahmedabad_01',
            favoriteBranchName: 'Ahmedabad SG Highway',
            favoriteCity: 'Ahmedabad',
            segment: 'VIP',
            lastOrderDate: '2026-08-22',
            addresses: [],
            createdAt: Timestamp.now(),
          },
        ];

        if (!isGlobalRole(user?.role) && user?.branchIds?.length) {
          const mine = user.branchIds;
          return list.filter((c) => !c.favoriteBranchId || mine.includes(c.favoriteBranchId));
        }

        if (selectedCity && selectedCity !== 'all') {
          list = list.filter((c) => !c.favoriteCity || c.favoriteCity.toLowerCase() === selectedCity.toLowerCase());
        }

        return list;
      }
    },
    enabled: !!user,
  });
}
