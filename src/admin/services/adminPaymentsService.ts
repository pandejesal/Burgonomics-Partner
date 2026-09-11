import { db } from "@/core/config/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  onSnapshot,
} from "firebase/firestore";
import { TransactionDetails, RefundDetails, DiscrepancyDetails } from "../pages/paymentsData";

export const adminPaymentsService = {
  /**
   * Listen for live incoming payment transactions.
   */
  listenLiveTransactions(
    onUpdate: (transactions: TransactionDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = 100,
  ) {
    const q = query(collection(db, "payments"), orderBy("createdAt", "desc"), limit(limitCount));

    return onSnapshot(
      q,
      (snapshot) => {
        const liveTransactions: TransactionDetails[] = [];
        snapshot.forEach((docSnap) => {
          liveTransactions.push(docSnap.data() as TransactionDetails);
        });
        onUpdate(liveTransactions);
      },
      (error) => onError(error),
    );
  },

  /**
   * Listen for live refunds.
   */
  listenLiveRefunds(
    onUpdate: (refunds: RefundDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = 100,
  ) {
    const q = query(collection(db, "refunds"), orderBy("createdAt", "desc"), limit(limitCount));

    return onSnapshot(
      q,
      (snapshot) => {
        const liveRefunds: RefundDetails[] = [];
        snapshot.forEach((docSnap) => {
          liveRefunds.push(docSnap.data() as RefundDetails);
        });
        onUpdate(liveRefunds);
      },
      (error) => onError(error),
    );
  },

  /**
   * Listen for live discrepancies.
   */
  listenLiveDiscrepancies(
    onUpdate: (discrepancies: DiscrepancyDetails[]) => void,
    onError: (err: Error) => void,
    limitCount = 100,
  ) {
    const q = query(
      collection(db, "payment_discrepancies"),
      orderBy("createdAt", "desc"),
      limit(limitCount),
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const liveDiscrepancies: DiscrepancyDetails[] = [];
        snapshot.forEach((docSnap) => {
          // Loop 25/120: stamp the doc id — resolvers need it for POST
          // /discrepancies/resolve, and server docs don't carry it inside.
          liveDiscrepancies.push({ id: docSnap.id, ...(docSnap.data() as any) } as DiscrepancyDetails);
        });
        onUpdate(liveDiscrepancies);
      },
      (error) => onError(error),
    );
  },

  // Loop 25/120: REMOVED resolveDiscrepancy direct client write — it could
  // never succeed (rules deny all client writes to payment_discrepancies)
  // and had zero callers. Resolution flows through POST
  // /discrepancies/resolve via partnerFunctionsApi.resolveDiscrepancy.
};
