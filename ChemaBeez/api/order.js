const nodemailer = require('nodemailer');
const axios = require('axios');

const JAR_PRICES = {
  '250g': 300,
  '500g': 550,
  '1kg': 1000,
};

function calculateAmount(jarSize, quantity) {
  const unitPrice = JAR_PRICES[jarSize];
  const qty = Number(quantity);
  if (!unitPrice || !Number.isFinite(qty) || qty <= 0) {
    return null;
  }
  return qty * unitPrice;
}

function formatOrderEmail(data) {
  const {
    name,
    email,
    phone,
    jarSize,
    quantity,
    deliveryDate,
    deliveryTime,
    location,
    paymentMethod,
    amount,
    notes,
  } = data;

  return [
    `New honey order from ${name}`,
    '',
    `Name: ${name}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    '',
    `Jar size: ${jarSize}`,
    `Quantity: ${quantity}`,
    '',
    `Preferred delivery date: ${deliveryDate}`,
    `Preferred delivery time: ${deliveryTime}`,
    `Delivery location: ${location}`,
    '',
    `Payment method: ${paymentMethod}`,
    `Amount to charge (if M-Pesa): ${amount || 'N/A'}`,
    '',
    `Notes: ${notes || 'None'}`,
  ].join('\n');
}

function sanitizePhoneNumber(phone) {
  if (!phone) return null;
  const trimmed = phone.replace(/\s+/g, '');
  if (trimmed.startsWith('+')) {
    return trimmed.substring(1);
  }
  if (trimmed.startsWith('0')) {
    return '254' + trimmed.substring(1);
  }
  return trimmed;
}

function getMpesaBaseUrl() {
  const env = (process.env.MPESA_ENV || 'sandbox').toLowerCase();
  return env === 'production'
    ? 'https://api.safaricom.co.ke'
    : 'https://sandbox.safaricom.co.ke';
}

async function getMpesaAccessToken() {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error('M-Pesa consumer key/secret not configured');
  }

  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const url = `${getMpesaBaseUrl()}/oauth/v1/generate?grant_type=client_credentials`;

  const response = await axios.get(url, {
    headers: {
      Authorization: `Basic ${auth}`,
    },
  });

  return response.data.access_token;
}

function getTimestamp() {
  const now = new Date();
  const YYYY = now.getFullYear().toString();
  const MM = String(now.getMonth() + 1).padStart(2, '0');
  const DD = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
}

async function initiateMpesaStkPush({ phoneNumber, amount, accountReference, transactionDesc }) {
  const shortCode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  if (!shortCode || !passkey || !callbackUrl) {
    throw new Error('M-Pesa shortcode/passkey/callback URL not fully configured');
  }

  const timestamp = getTimestamp();
  const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');

  const token = await getMpesaAccessToken();

  const payload = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Number(amount),
    PartyA: phoneNumber,
    PartyB: shortCode,
    PhoneNumber: phoneNumber,
    CallBackURL: callbackUrl,
    AccountReference: accountReference || 'ChemaBeez Honey',
    TransactionDesc: transactionDesc || 'Honey purchase',
  };

  const url = `${getMpesaBaseUrl()}/mpesa/stkpush/v1/processrequest`;

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

let mailTransporter;
let orderNotificationEmail;
let emailConfigured = false;

function initEmail() {
  if (mailTransporter) {
    return;
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_PASS;
  orderNotificationEmail = process.env.ORDER_NOTIFICATION_EMAIL || gmailUser;

  emailConfigured = Boolean(gmailUser && gmailPass && orderNotificationEmail);

  if (!emailConfigured) {
    console.warn('Email not fully configured; skipping order notification email.');
    return;
  }

  mailTransporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: gmailUser,
      pass: gmailPass,
    },
  });
}

function sendJson(res, statusCode, body) {
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    return res.status(statusCode).json(body);
  }
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { success: false, message: 'Method Not Allowed' });
  }

  const {
    name,
    email,
    phone,
    jarSize,
    quantity,
    deliveryDate,
    deliveryTime,
    location,
    paymentMethod,
    notes,
  } = req.body || {};

  if (!name || !phone || !jarSize || !quantity) {
    return sendJson(res, 400, { success: false, message: 'Please fill in all required fields.' });
  }

  const computedAmount = calculateAmount(jarSize, quantity);

  if (!computedAmount) {
    return sendJson(res, 400, { success: false, message: 'Invalid jar size or quantity.' });
  }

  const orderData = {
    name,
    email,
    phone,
    jarSize,
    quantity,
    deliveryDate,
    deliveryTime,
    location,
    paymentMethod,
    amount: computedAmount,
    notes,
  };

  initEmail();

  let mpesaResult = null;

  try {
    if (paymentMethod === 'mpesa' && computedAmount && phone) {
      const sanitizedPhone = sanitizePhoneNumber(phone);
      if (!sanitizedPhone) {
        throw new Error('Invalid phone number for M-Pesa');
      }

      try {
        mpesaResult = await initiateMpesaStkPush({
          phoneNumber: sanitizedPhone,
          amount: computedAmount,
          accountReference: `Honey-${quantity}x${jarSize}`,
          transactionDesc: 'ChemaBeez honey order',
        });
      } catch (mpesaError) {
        console.error('M-Pesa STK push failed:', mpesaError.response?.data || mpesaError.message);
        mpesaResult = {
          error: true,
          message: 'Failed to initiate M-Pesa STK push. Please try again or pay on delivery.',
        };
      }
    }

    if (emailConfigured && mailTransporter && orderNotificationEmail) {
      const gmailUser = process.env.GMAIL_USER;
      const mailOptions = {
        from: gmailUser,
        to: orderNotificationEmail,
        subject: `New Honey Order from ${name}`,
        text: formatOrderEmail(orderData),
      };

      try {
        await mailTransporter.sendMail(mailOptions);
      } catch (emailErr) {
        console.error('Error sending order email:', emailErr.message);
      }
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Order received. You will receive honey delivery as agreed.',
      mpesa: mpesaResult,
    });
  } catch (err) {
    console.error('Error handling order:', err.message);
    return sendJson(res, 500, {
      success: false,
      message: 'Something went wrong while processing your order. Please try again.',
    });
  }
};
