import type { Timestamp } from 'firebase/firestore';

// User types
export type UserRole =
  | 'brand_owner'
  | 'developer'
  | 'support'
  | 'regional_manager'
  | 'branch_owner'
  | 'branch_staff';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  branchIds: string[];
  cityIds: string[];
  phone: string;
  avatar?: string;
  fcmToken?: string;
  createdAt: Timestamp;
}

// Branch & Future Store types
export type BranchStatus = 'active' | 'inactive' | 'coming_soon';
export type AcceptingOrdersStatus = 'open' | 'busy' | 'closed';

export interface Branch {
  id: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  active: boolean;
  status?: BranchStatus;
  acceptingOrdersStatus?: AcceptingOrdersStatus;
  prepTimeMinutes?: number;
  deliveryRadiusKm?: number;
  announcementBanner?: string;
  expectedLaunchDate?: string;
  bannerImage?: string;
  petpoojaStoreId?: string;
  allowComingSoonSubscribers?: boolean;
  subscribersCount?: number;
  coordinates: {
    lat: number;
    lng: number;
  };
  operatingHours?: {
    open: string;
    close: string;
  };
  createdAt: Timestamp;
  updatedAt?: Timestamp;
}

export interface FutureStoreInput {
  name: string;
  city: string;
  address: string;
  phone: string;
  expectedLaunchDate: string;
  bannerImage?: string;
  petpoojaStoreId?: string;
  allowComingSoonSubscribers: boolean;
  lat: number;
  lng: number;
}

// Order types
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled'
  // Quarantine bucket for docs with an unrecognized status or corrupt shape.
  // Fail-closed: quarantined orders never appear as fresh pending work.
  | 'quarantine';

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
  branchName?: string;
  city?: string;
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
  petpoojaSyncStatus?: 'synced' | 'failed' | 'pending' | 'not_applicable';
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
  // Set when status resolved to 'quarantine' — machine-readable reason for
  // the review banner. Never shown as fresh kitchen/dispatch work.
  quarantineReason?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// Customer CRM types
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
  totalOrders?: number;
  totalSpend?: number;
  averageOrderValue?: number;
  favoriteBranchId?: string;
  favoriteBranchName?: string;
  favoriteCity?: string;
  segment?: 'VIP' | 'Regular' | 'New' | 'At-Risk';
  lastOrderDate?: Timestamp | string;
  createdAt: Timestamp;
}

// Chat types
export type ChatType = 'branch_channel' | 'direct_dm';

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  senderAvatar?: string;
  text: string;
  imageUrl?: string;
  createdAt: Timestamp;
  readBy?: string[];
}

export interface ChatThread {
  id: string;
  type: ChatType;
  title: string;
  branchId?: string;
  branchName?: string;
  participantIds: string[];
  participantNames: Record<string, string>;
  lastMessageText?: string;
  lastMessageSender?: string;
  lastMessageAt?: Timestamp;
  unreadCount?: number;
  createdAt: Timestamp;
}

// Ticket & Issue types
export type TicketCategory =
  | 'pos_sync'
  | 'app_bug'
  | 'hardware_printer'
  | 'inventory_stock'
  | 'customer_escalation'
  | 'payment_refund'
  | 'other';

export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type TicketType = TicketCategory;

export interface TicketComment {
  id: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  text: string;
  createdAt: Timestamp;
}

export interface Ticket {
  id: string;
  ticketNumber?: string;
  title: string;
  customerId?: string;
  branchId: string;
  branchName?: string;
  city?: string;
  raisedById: string;
  raisedByName: string;
  raisedByRole: UserRole;
  category: TicketCategory;
  priority: TicketPriority;
  message: string;
  orderId?: string;
  status: TicketStatus;
  assignedTo?: string;
  assignedToName?: string;
  resolvedById?: string;
  resolvedByName?: string;
  resolvedAt?: Timestamp;
  resolution?: string;
  resolutionNotes?: string;
  attachments?: string[];
  comments?: TicketComment[];
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
export type NotificationType = 'order' | 'ticket' | 'chat' | 'system';

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  targetId?: string;
  read: boolean;
  readAt?: Timestamp;
  createdAt: Timestamp;
}

