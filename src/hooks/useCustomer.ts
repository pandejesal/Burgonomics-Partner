import { useQuery } from '@tanstack/react-query';
import { db } from '@/config/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import type { Customer, Order } from '@/types';
import { normalizeOrderDoc } from '@/utils/orderContract';

interface CustomerWithOrders extends Customer {
  orders: Order[];
  totalSpent: number;
  orderCount: number;
}

export function useCustomer(customerId: string) {
  return useQuery<CustomerWithOrders>({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      const customerRef = doc(db, 'customers', customerId);
      const customerSnap = await getDoc(customerRef);

      if (!customerSnap.exists()) {
        throw new Error('Customer not found');
      }

      const customerData = {
        id: customerSnap.id,
        ...customerSnap.data(),
      } as Customer;

      // Get customer orders
      const ordersSnap = await getDocs(
        query(
          collection(db, 'orders'),
          where('customerId', '==', customerId),
          orderBy('createdAt', 'desc')
        )
      );

      const orders = ordersSnap.docs.map((d) =>
        normalizeOrderDoc(d.id, d.data() as Record<string, any>)
      );

      return {
        ...customerData,
        orders,
        totalSpent: orders.reduce((sum, o) => sum + (o.total || 0), 0),
        orderCount: orders.length,
      };
    },
    enabled: !!customerId,
  });
}
