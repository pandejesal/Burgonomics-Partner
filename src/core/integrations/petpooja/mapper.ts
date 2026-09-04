export interface PetpoojaAddonItem {
  id: string;
  name: string;
  group_name: string;
  price: string;
}

export interface PetpoojaOrderItem {
  id: string;
  name: string;
  price: string;
  qty: string;
  tax_inclusive: "1" | "0";
  addonitem: PetpoojaAddonItem[];
}

export interface PetpoojaTax {
  id: string;
  title: string;
  type: string;
  price: string;
  tax: string;
}

export interface PetpoojaDiscount {
  id: string;
  title: string;
  type: string;
  price: string;
}

export interface PetpoojaSaveOrderPayload {
  app_key: string;
  app_secret: string;
  access_token: string;
  res_name: string;
  address: string;
  Contact_information: string;
  restID: string;
  OrderInfo: {
    Customer: {
      name: string;
      email: string;
      address: string;
      phone: string;
    };
    Order: {
      orderID: string;
      preorder_date: string;
      minimum_prep_time: string;
      collect_cash: "1" | "0";
      otp?: string;
      details?: string;
      ondc_bap?: string;
      urgent_order?: "0" | "1";
      urgent_time?: string;
    };
    OrderItem: PetpoojaOrderItem[];
    Tax: PetpoojaTax[];
    Discount: PetpoojaDiscount[];
  };
}

export interface PetpoojaCredentials {
  appKey?: string;
  appSecret?: string;
  accessToken?: string;
}

export function mapOrderToPetpoojaSaveOrder(
  order: any,
  store?: any,
  creds?: PetpoojaCredentials,
): PetpoojaSaveOrderPayload {
  const isCod = order.paymentMethod === "cod" || order.paymentMethod === "COD";
  const restId = store?.petpoojaRestId || `rest_${order.storeId || order.branchId || "001"}`;

  return {
    // Secrets are NEVER hardcoded here. The server proxy injects live
    // credentials; empty strings mean "fill in server-side".
    app_key: creds?.appKey || "",
    app_secret: creds?.appSecret || "",
    access_token: creds?.accessToken || "",
    res_name: store?.name || "Burgonomics Express",
    address: store?.address || "Connaught Place, New Delhi",
    Contact_information: store?.phone || "+91 11 4151 8899",
    restID: restId,
    OrderInfo: {
      Customer: {
        name: order.deliveryAddress?.contactName || order.customerName || "Walk-in Guest",
        email: order.deliveryAddress?.contactEmail || order.customerEmail || "guest@burgonomics.local",
        address: order.deliveryAddress?.street || order.deliveryAddress?.formattedAddress || "Store Counter",
        phone: order.deliveryAddress?.contactPhone || order.customerPhone || "+91 99999 00000",
      },
      Order: {
        orderID: order.id || `ord_${Date.now()}`,
        preorder_date: new Date().toISOString().split("T")[0],
        minimum_prep_time: "15",
        collect_cash: isCod ? "1" : "0",
        details: order.specialInstructions || "Customer requested contact-free packaging",
      },
      OrderItem: (order.items || []).map((item: any) => ({
        id: item.productId || item.id || "item_1",
        name: item.productName || item.name || "Special Burger",
        price: String(item.price || 199),
        qty: String(item.quantity || 1),
        tax_inclusive: "1",
        addonitem: (item.selectedModifiers || item.modifiers || []).map((mod: any) => ({
          id: mod.id || "mod_1",
          name: mod.name || "Extra Cheese",
          group_name: mod.groupName || "Addons",
          price: String(mod.price || 0),
        })),
      })),
      Tax: [
        {
          id: "tax_gst",
          title: "GST (5%)",
          type: "P",
          price: String(order.pricing?.tax || 15),
          tax: "5.0",
        },
      ],
      Discount: order.pricing?.discount
        ? [
            {
              id: "disc_coupon",
              title: order.couponCode ? `Coupon ${order.couponCode}` : "Promotional Discount",
              type: "F",
              price: String(order.pricing.discount),
            },
          ]
        : [],
    },
  };
}
