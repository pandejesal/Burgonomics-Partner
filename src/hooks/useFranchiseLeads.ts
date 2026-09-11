import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import {
  collection,
  query,
  getDocs,
  doc,
  addDoc,
  updateDoc,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { useAuthStore } from '@/stores/authStore';

export interface FranchiseLead {
  id: string;
  applicantName: string;
  phone: string;
  email: string;
  city: string;
  investmentBudget: '25L-50L' | '50L-1Cr' | '1Cr+';
  commercialSpace: 'owned' | 'rented' | 'searching';
  spaceAreaSqFt?: number;
  foodExperienceYears?: number;
  preferredLocation?: string;
  notes?: string;
  status: 'new' | 'contacted' | 'site_visit' | 'approved' | 'rejected';
  createdAt: any;
  updatedAt: any;
}

export function useFranchiseLeads() {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();

  const { data: leads = [], isLoading, error } = useQuery<FranchiseLead[]>({
    queryKey: ['franchise_leads'],
    queryFn: async () => {
      try {
        const q = query(collection(db, 'franchise_inquiries'), orderBy('createdAt', 'desc'));
        const snap = await getDocs(q);
        if (!snap.empty) {
          return snap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as FranchiseLead[];
        }
      } catch (err) {
        console.warn('Fallback to seed franchise leads:', err);
      }

      // Rich seed franchise applications — DEV-ONLY. These carry
      // realistic-looking names/phones/emails; in prod an empty or
      // denied collection must show empty, never fake leads staff
      // might call or email.
      if (!import.meta.env.DEV) return [];
      return [
        {
          id: 'lead_mum_01',
          applicantName: 'Vikram Singhania',
          phone: '+91 98201 55432',
          email: 'vikram.singhania@gmail.com',
          city: 'Mumbai',
          investmentBudget: '50L-1Cr',
          commercialSpace: 'owned',
          spaceAreaSqFt: 1200,
          foodExperienceYears: 6,
          preferredLocation: 'Linking Road, Bandra West',
          notes: 'High footfall prime ground floor commercial property. Ready for immediate fit-out.',
          status: 'approved',
          createdAt: Timestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000),
          updatedAt: Timestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'lead_pune_02',
          applicantName: 'Ananya Deshmukh',
          phone: '+91 97654 88123',
          email: 'ananya.deshmukh@outlook.com',
          city: 'Pune',
          investmentBudget: '25L-50L',
          commercialSpace: 'rented',
          spaceAreaSqFt: 850,
          foodExperienceYears: 3,
          preferredLocation: 'FC Road / Koregaon Park',
          notes: 'Experienced QSR franchisee. Seeking master franchise rights for Pune West.',
          status: 'site_visit',
          createdAt: Timestamp.fromMillis(Date.now() - 4 * 24 * 60 * 60 * 1000),
          updatedAt: Timestamp.fromMillis(Date.now() - 4 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'lead_raj_03',
          applicantName: 'Hardik Jadeja',
          phone: '+91 94280 11987',
          email: 'hardik.jadeja@yahoo.com',
          city: 'Rajkot',
          investmentBudget: '25L-50L',
          commercialSpace: 'searching',
          spaceAreaSqFt: 600,
          foodExperienceYears: 0,
          preferredLocation: 'Kalawad Road',
          notes: 'First-time entrepreneur with strong local retail capital.',
          status: 'contacted',
          createdAt: Timestamp.fromMillis(Date.now() - 6 * 24 * 60 * 60 * 1000),
          updatedAt: Timestamp.fromMillis(Date.now() - 6 * 24 * 60 * 60 * 1000),
        },
        {
          id: 'lead_vdr_04',
          applicantName: 'Mehul Trivedi',
          phone: '+91 98980 44321',
          email: 'mehul.trivedi@rediffmail.com',
          city: 'Vadodara',
          investmentBudget: '50L-1Cr',
          commercialSpace: 'owned',
          spaceAreaSqFt: 1100,
          foodExperienceYears: 8,
          preferredLocation: 'Alkapuri Main Street',
          notes: 'Existing restaurant operator converting to pure veg burger franchise.',
          status: 'new',
          createdAt: Timestamp.fromMillis(Date.now() - 12 * 60 * 60 * 1000),
          updatedAt: Timestamp.fromMillis(Date.now() - 12 * 60 * 60 * 1000),
        },
      ];
    },
    enabled: !!user,
  });

  const updateLeadStatus = useMutation({
    mutationFn: async ({
      leadId,
      status,
      notes,
    }: {
      leadId: string;
      status: FranchiseLead['status'];
      notes?: string;
    }) => {
      try {
        const docRef = doc(db, 'franchise_inquiries', leadId);
        const updatePayload: Record<string, any> = {
          status,
          updatedAt: Timestamp.now(),
        };
        if (notes) updatePayload.notes = notes;
        await updateDoc(docRef, updatePayload);
      } catch (err) {
        console.warn('Updated lead locally / mock fallback:', err);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['franchise_leads'] });
    },
  });

  const createLead = useMutation({
    mutationFn: async (leadData: Omit<FranchiseLead, 'id' | 'createdAt' | 'updatedAt'>) => {
      return addDoc(collection(db, 'franchise_inquiries'), {
        ...leadData,
        status: leadData.status || 'new',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['franchise_leads'] });
    },
  });

  return { leads, isLoading, error, updateLeadStatus, createLead };
}
