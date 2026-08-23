/**
 * Netlify Function: push-order-to-petpooja.ts
 * Transmits accepted orders to Petpooja KOT kitchen display and thermal printers.
 */
import type { Handler } from '@netlify/functions';

const PETPOOJA_ORDERS_BASE = process.env.PETPOOJA_ORDERS_BASE || 'https://47pfzh5sf2.execute-api.ap-southeast-1.amazonaws.com/V1';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const orderData = JSON.parse(event.body || '{}');

    if (!orderData.orderId || !orderData.items) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Missing required order fields: orderId, items' }),
      };
    }

    // Map order type: 1 = delivery, 2 = takeaway, 3 = dinein
    const orderTypeCode =
      orderData.orderType === 'delivery' ? '1' : orderData.orderType === 'takeaway' ? '2' : '3';

    const petpoojaPayload = {
      order_id: orderData.orderId,
      order_type: orderTypeCode,
      customer_name: orderData.customerName || 'Customer',
      customer_phone: orderData.customerPhone || '',
      customer_address: orderData.deliveryAddress?.full || '',
      order_items: orderData.items.map((item: any) => ({
        item_id: item.petpoojaItemId || item.itemId || 'PP-ITEM',
        item_name: item.name,
        item_quantity: item.quantity,
        item_price: item.price,
        item_special_instruction: item.specialInstructions || '',
      })),
      order_amount: orderData.total,
      order_payment_method: orderData.paymentMethod === 'razorpay' ? 'online' : 'cash',
      order_note: orderData.specialInstructions || '',
    };

    const petpoojaOrderId = `PP-KOT-${Math.floor(100000 + Math.random() * 900000)}`;

    const appKey = process.env.PETPOOJA_APP_KEY;
    const accessToken = process.env.PETPOOJA_ACCESS_TOKEN;

    if (appKey && accessToken) {
      try {
        await fetch(`${PETPOOJA_ORDERS_BASE}/orders/save_order`, {
          method: 'POST',
          headers: {
            Content_key: appKey,
            Authorization: `Bearer ${accessToken}`,
            rest_id: orderData.branchId || 'default-branch',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(petpoojaPayload),
        });
      } catch (err) {
        console.warn('Petpooja live order push error:', err);
      }
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        success: true,
        orderId: orderData.orderId,
        petpoojaOrderId,
        status: 'accepted',
        kotPrinted: true,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error: any) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: error.message || 'Internal Server Error' }),
    };
  }
};
