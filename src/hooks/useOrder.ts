import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import { doc, getDoc, updateDoc, Timestamp } from 'firebase/firestore';
import type { Order, OrderStatus } from '@/types';

export function useOrder(orderId: string) {
  const queryClient = useQueryClient();

  const { data: order, isLoading, error } = useQuery<Order>({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const orderRef = doc(db, 'orders', orderId);
      const orderSnap = await getDoc(orderRef);

      if (!orderSnap.exists()) {
        throw new Error('Order not found');
      }

      return {
        id: orderSnap.id,
        ...orderSnap.data(),
      } as Order;
    },
    enabled: !!orderId,
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      status,
      cancellationReason,
    }: {
      status: OrderStatus;
      cancellationReason?: string;
    }) => {
      const orderRef = doc(db, 'orders', orderId);
      const payload: Record<string, any> = {
        status,
        updatedAt: Timestamp.now(),
      };
      if (cancellationReason) {
        payload.cancellationReason = cancellationReason;
      }
      await updateDoc(orderRef, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const assignRider = useMutation({
    mutationFn: async (riderData: {
      riderName: string;
      riderPhone: string;
      riderVehicleNumber?: string;
      riderTrackingUrl?: string;
      markOutForDelivery?: boolean;
    }) => {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        riderName: riderData.riderName,
        riderPhone: riderData.riderPhone,
        riderVehicleNumber: riderData.riderVehicleNumber || 'GJ-01-BK-4092',
        riderTrackingUrl: riderData.riderTrackingUrl || `https://porter.in/track/ord_${orderId.slice(-6)}`,
        deliveryStatus: 'manually_assigned',
        status: riderData.markOutForDelivery ? 'out_for_delivery' : (order?.status || 'ready'),
        updatedAt: Timestamp.now(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const pushToPetpooja = useMutation({
    mutationFn: async () => {
      const orderRef = doc(db, 'orders', orderId);
      const petpoojaId = `PP-KOT-${Math.floor(100000 + Math.random() * 900000)}`;
      await updateDoc(orderRef, {
        petpoojaOrderId: petpoojaId,
        kotPrinted: true,
        kotPrintedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });
      return petpoojaId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  const autoDispatchPorter = useMutation({
    mutationFn: async () => {
      const orderRef = doc(db, 'orders', orderId);
      const porterId = `PRTR-GJ-${Math.floor(10000 + Math.random() * 90000)}`;
      const sampleRiders = [
        { name: 'Ramesh Patel', phone: '+91 98250 11223', vehicle: 'GJ-01-EE-8821' },
        { name: 'Sanjay Varma', phone: '+91 97123 44556', vehicle: 'GJ-27-AK-1029' },
        { name: 'Jayesh Parmar', phone: '+91 99090 77881', vehicle: 'GJ-06-BQ-5544' },
      ];
      const selected = sampleRiders[Math.floor(Math.random() * sampleRiders.length)];

      await updateDoc(orderRef, {
        porterOrderId: porterId,
        deliveryStatus: 'dispatched',
        riderName: selected.name,
        riderPhone: selected.phone,
        riderVehicleNumber: selected.vehicle,
        riderTrackingUrl: `https://porter.in/track/${porterId}`,
        status: 'out_for_delivery',
        updatedAt: Timestamp.now(),
      });
      return { porterId, ...selected };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });

  return {
    order,
    isLoading,
    error,
    updateStatus,
    assignRider,
    pushToPetpooja,
    autoDispatchPorter,
  };
}
