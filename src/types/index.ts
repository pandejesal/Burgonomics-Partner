import type { Timestamp } from 'firebase/firestore';

// User types
export type UserRole = 'brand_owner' | 'regional_manager' | 'branch_owner';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchIds: string[];
  cityIds: string[];
  phone: string;
  fcmToken?: string;
  createdAt: Timestamp;
}

// Branch types
export interface Branch {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  active: boolean;
  coordinates: {
    lat: number;
    lng: number;
  };
  operatingHours: {
    open: string;
    close: string;
  };
  createdAt: Timestamp;
}

// Order types
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type OrderType = 'delivery' | 'takeaway' | 'dinein';

export interface OrderItem {
  itemId: string;
  petpoojaItemId: string;
  name: string;
  quantity: number;
  price: number;
  specialInstructions?: string;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  branchId: string;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  deliveryFee: number;
  total: number;
  orderType: OrderType;
  deliveryAddress?: Address;
  tableNumber?: string;
  status: OrderStatus;
  paymentMethod: 'razorpay' | 'cod' | 'upi';
  paymentStatus: 'pending' | 'completed' | 'failed';
  petpoojaOrderId?: string;
  porterOrderId?: string;
  deliveryStatus?: 'dispatched' | 'no_riders_available' | 'manually_assigned';
  riderName?: string;
  riderPhone?: string;
  riderVehicleNumber?: string;
  riderTrackingUrl?: string;
  kotPrinted?: boolean;
  kotPrintedAt?: Timestamp;
  cancellationReason?: string;
  specialInstructions?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Customer types
export interface Address {
  id: string;
  label: string;
  full: string;
  lat: number;
  lng: number;
  isDefault: boolean;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  photoUrl?: string;
  addresses: Address[];
  loyaltyPoints: number;
  createdAt: Timestamp;
}

// Ticket types
export type TicketType =
  | 'wrong_item'
  | 'late_delivery'
  | 'quality'
  | 'payment'
  | 'maintenance'
  | 'supply'
  | 'equipment'
  | 'other';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface Ticket {
  id: string;
  customerId?: string;
  branchId: string;
  raisedBy: 'customer' | 'branch_owner';
  type: TicketType;
  message: string;
  orderId?: string;
  status: TicketStatus;
  assignedTo?: string;
  resolution?: string;
  attachments?: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Menu types
export interface MenuCategory {
  id: string;
  name: string;
  sortOrder: number;
  active: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  categoryId: string;
  image: string;
  available: boolean;
  veg: boolean;
  petpoojaItemId: string;
  lastSyncedAt?: Timestamp;
}

// Notification types
export type NotificationType = 'order' | 'ticket' | 'system';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  read: boolean;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

