import { toast } from "sonner";

export interface MarketingCampaign {
  id: string;
  name: string;
  description: string;
  objective:
    "Brand Awareness" | "Sales Conversion" | "User Retention" | "Re-engagement" | "Feedback Survey";
  channels: Array<"Push" | "SMS" | "WhatsApp" | "Email" | "In-App">;
  status: "Draft" | "Scheduled" | "Active" | "Paused" | "Completed" | "Archived";
  audienceType:
    | "Entire Base"
    | "Store Specific"
    | "City Specific"
    | "Custom Segment"
    | "VIP"
    | "Inactive"
    | "New Profiles"
    | "High Value"
    | "Birthday"
    | "Manual Selection";
  audienceFilterValue?: string; // stores segmentId, storeName, city etc.
  messageTitle: string;
  messageBody: string;
  messageImage?: string;
  deepLink?: string;
  couponCode?: string;
  createdAt: string;
  createdBy: string;
  scheduledTime?: string;
  stats: {
    sent: number;
    delivered: number;
    clicked: number;
    failed: number;
    revenue: number;
  };
  abTesting?: {
    enabled: boolean;
    subjectA: string;
    subjectB: string;
    splitPercent: number; // e.g. 20% test, 80% winner
    winner?: "A" | "B";
    metricsA: { sent: number; opened: number; revenue: number };
    metricsB: { sent: number; opened: number; revenue: number };
  };
}

export interface MarketingTemplate {
  id: string;
  name: string;
  category:
    | "Promotions"
    | "Birthday"
    | "Order Follow-up"
    | "Festival"
    | "Offers"
    | "New Store"
    | "Coupons"
    | "Loyalty"
    | "Feedback"
    | "Referral";
  channels: Array<"Push" | "SMS" | "WhatsApp" | "Email" | "In-App">;
  title: string;
  body: string;
  imageUrl?: string;
  deepLink?: string;
  variables: string[];
}

export interface MarketingOffer {
  id: string;
  name: string;
  description: string;
  type:
    | "BOGO"
    | "Combo Offer"
    | "Flat Discount"
    | "Percentage Discount"
    | "Free Delivery"
    | "Limited Time"
    | "Festival Offer"
    | "Store Specific";
  discountValue?: number;
  minOrderValue?: number;
  stores?: string[];
  status: "Active" | "Inactive";
  validFrom: string;
  validTo: string;
}

export interface AutomationNode {
  id: string;
  type: "trigger" | "action" | "wait" | "condition";
  label: string;
  config: Record<string, any>;
}

export interface AutomationEdge {
  id: string;
  from: string;
  to: string;
}

export interface MarketingAutomation {
  id: string;
  name: string;
  triggerType:
    | "Registration"
    | "Birthday"
    | "Anniversary"
    | "Order Completed"
    | "First Order"
    | "Nth Order"
    | "No Orders"
    | "Coupon Expiring"
    | "Points Expiring"
    | "Store Opened"
    | "Festival"
    | "Manual";
  status: "Active" | "Inactive";
  description: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  stats: {
    triggered: number;
    completed: number;
    conversions: number;
  };
}

export interface NotificationHistoryItem {
  id: string;
  customerName: string;
  customerId: string;
  channel: "Push" | "SMS" | "WhatsApp" | "Email" | "In-App";
  title: string;
  body: string;
  status: "Delivered" | "Read" | "Clicked" | "Failed";
  sentAt: string;
  retryCount: number;
  campaignId?: string;
  errorMessage?: string;
}

// Task 1.2: demo marketing seeds removed from the production bundle. The
// marketing module starts empty and loads only records persisted by admin actions.

// Initial Campaigns
// Initial Offers
// Initial Automations
// Initial Notification Logs
class MarketingDataStorage {
  private campaigns: MarketingCampaign[] = [];
  private templates: MarketingTemplate[] = [];
  private offers: MarketingOffer[] = [];
  private automations: MarketingAutomation[] = [];
  private history: NotificationHistoryItem[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    // No seed data ships in the bundle: the marketing module starts empty and
    // loads only records persisted by admin actions (or stays empty in
    // non-browser envs).
    if (typeof window !== "undefined") {
      const storedCampaigns = localStorage.getItem("burg_mkt_campaigns");
      const storedTemplates = localStorage.getItem("burg_mkt_templates");
      const storedOffers = localStorage.getItem("burg_mkt_offers");
      const storedAutomations = localStorage.getItem("burg_mkt_automations");
      const storedHistory = localStorage.getItem("burg_mkt_history");

      this.campaigns = storedCampaigns ? JSON.parse(storedCampaigns) : [];
      this.templates = storedTemplates ? JSON.parse(storedTemplates) : [];
      this.offers = storedOffers ? JSON.parse(storedOffers) : [];
      this.automations = storedAutomations ? JSON.parse(storedAutomations) : [];
      this.history = storedHistory ? JSON.parse(storedHistory) : [];
    } else {
      this.campaigns = [];
      this.templates = [];
      this.offers = [];
      this.automations = [];
      this.history = [];
    }
  }

  private saveToStorage() {
    if (typeof window !== "undefined") {
      localStorage.setItem("burg_mkt_campaigns", JSON.stringify(this.campaigns));
      localStorage.setItem("burg_mkt_templates", JSON.stringify(this.templates));
      localStorage.setItem("burg_mkt_offers", JSON.stringify(this.offers));
      localStorage.setItem("burg_mkt_automations", JSON.stringify(this.automations));
      localStorage.setItem("burg_mkt_history", JSON.stringify(this.history));
    }
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.saveToStorage();
    this.listeners.forEach((listener) => listener());
  }

  // Getters
  getCampaigns(): MarketingCampaign[] {
    return this.campaigns;
  }

  getTemplates(): MarketingTemplate[] {
    return this.templates;
  }

  getOffers(): MarketingOffer[] {
    return this.offers;
  }

  getAutomations(): MarketingAutomation[] {
    return this.automations;
  }

  getHistory(): NotificationHistoryItem[] {
    return this.history;
  }

  // Campaign Actions
  createCampaign(campaign: Omit<MarketingCampaign, "id" | "createdAt" | "createdBy" | "stats">) {
    const id = `CAM-${Date.now().toString().slice(-4)}`;
    const newCampaign: MarketingCampaign = {
      ...campaign,
      id,
      createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
      createdBy: "Jesal Pande (Super Admin)",
      stats: {
        sent: 0,
        delivered: 0,
        clicked: 0,
        failed: 0,
        revenue: 0,
      },
    };

    this.campaigns.unshift(newCampaign);

    toast.success(`Campaign "${campaign.name}" created and saved.`);
    this.notify();
    return newCampaign;
  }

  updateCampaignStatus(id: string, status: MarketingCampaign["status"]) {
    const campaign = this.campaigns.find((c) => c.id === id);
    if (campaign) {
      campaign.status = status;

      toast.success(`Campaign "${campaign.name}" status updated to ${status}.`);
      this.notify();
      return true;
    }
    return false;
  }

  duplicateCampaign(id: string) {
    const original = this.campaigns.find((c) => c.id === id);
    if (original) {
      const copy: MarketingCampaign = {
        ...original,
        id: `CAM-${Date.now().toString().slice(-4)}`,
        name: `${original.name} (Copy)`,
        status: "Draft",
        createdAt: new Date().toISOString().slice(0, 19).replace("T", " "),
        stats: { sent: 0, delivered: 0, clicked: 0, failed: 0, revenue: 0 },
      };
      this.campaigns.unshift(copy);
      toast.success(`Duplicated campaign as "${copy.name}".`);
      this.notify();
      return copy;
    }
    return null;
  }

  deleteCampaign(id: string) {
    this.campaigns = this.campaigns.filter((c) => c.id !== id);
    toast.info("Campaign removed from repository.");
    this.notify();
    return true;
  }

  // Offer Actions
  createOffer(offer: Omit<MarketingOffer, "id">) {
    const newOffer: MarketingOffer = {
      ...offer,
      id: `OFF-${Date.now().toString().slice(-3)}`,
    };
    this.offers.unshift(newOffer);
    toast.success(`Promotional Offer "${offer.name}" activated.`);
    this.notify();
    return newOffer;
  }

  updateOfferStatus(id: string, status: MarketingOffer["status"]) {
    const offer = this.offers.find((o) => o.id === id);
    if (offer) {
      offer.status = status;
      toast.success(`Offer state adjusted to ${status}.`);
      this.notify();
      return true;
    }
    return false;
  }

  deleteOffer(id: string) {
    this.offers = this.offers.filter((o) => o.id !== id);
    toast.info("Offer deleted.");
    this.notify();
    return true;
  }

  // Template Actions
  createTemplate(template: Omit<MarketingTemplate, "id">) {
    const newTemplate: MarketingTemplate = {
      ...template,
      id: `TMP-${Date.now().toString().slice(-3)}`,
    };
    this.templates.unshift(newTemplate);
    toast.success(`Template "${template.name}" added to assets.`);
    this.notify();
    return newTemplate;
  }

  deleteTemplate(id: string) {
    this.templates = this.templates.filter((t) => t.id !== id);
    toast.info("Message template deleted.");
    this.notify();
    return true;
  }

  // Automation Actions
  createAutomation(automation: Omit<MarketingAutomation, "id" | "stats">) {
    const newAutomation: MarketingAutomation = {
      ...automation,
      id: `AUT-${Date.now().toString().slice(-3)}`,
      stats: { triggered: 0, completed: 0, conversions: 0 },
    };
    this.automations.unshift(newAutomation);
    toast.success(`Journey Automation "${automation.name}" configured.`);
    this.notify();
    return newAutomation;
  }

  updateAutomationStatus(id: string, status: MarketingAutomation["status"]) {
    const aut = this.automations.find((a) => a.id === id);
    if (aut) {
      aut.status = status;
      toast.success(`Journey flow "${aut.name}" toggled to ${status}.`);
      this.notify();
      return true;
    }
    return false;
  }

  deleteAutomation(id: string) {
    this.automations = this.automations.filter((a) => a.id !== id);
    toast.info("Journey flow deleted.");
    this.notify();
    return true;
  }
}

export const marketingStorage = new MarketingDataStorage();
