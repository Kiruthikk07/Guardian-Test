const express = require('express');
const db = require('../config/database');
const router = express.Router();

// POST /api/billing/webhook - Stripe webhook handler
router.post('/webhook', async (req, res) => {
  try {
    const { id, type, data } = req.body;

    // Here you would verify the webhook signature with Stripe
    // For now, we'll just process the webhook

    switch (type) {
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(data.object);
        break;
      default:
        console.log(`Unhandled webhook type: ${type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Handle successful payment
async function handlePaymentSucceeded(invoice) {
  try {
    const result = await db.query(`
      UPDATE tenants 
      SET subscription_status = 'active',
        last_payment_date = NOW(),
        next_billing_date = $1,
        updated_at = NOW()
      WHERE stripe_customer_id = $2
      RETURNING *
    `, [invoice.next_payment_attempt, invoice.customer]);

    if (result.rows.length > 0) {
      console.log(`Payment succeeded for tenant: ${result.rows[0].id}`);
    }
  } catch (error) {
    console.error('Error handling payment succeeded:', error);
  }
}

// Handle failed payment
async function handlePaymentFailed(invoice) {
  try {
    const result = await db.query(`
      UPDATE tenants 
      SET subscription_status = 'past_due',
        last_payment_date = NOW(),
        next_billing_date = $1,
        updated_at = NOW()
      WHERE stripe_customer_id = $2
      RETURNING *
    `, [invoice.next_payment_attempt, invoice.customer]);

    if (result.rows.length > 0) {
      console.log(`Payment failed for tenant: ${result.rows[0].id}`);
      
      // Create notification for tenant admin
      await db.query(`
        INSERT INTO notifications (user_id, notification_type, title, message, data)
        SELECT u.id, 'payment_failed', 'Payment Failed', 
               'Your subscription payment has failed. Please update your payment method.',
               '{"invoice_id": $1}'
        FROM users u
        WHERE u.tenant_id = $2 AND u.role = 'parent'
        LIMIT 1
      `, [invoice.id, result.rows[0].id]);
    }
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
}

// Handle subscription update
async function handleSubscriptionUpdated(subscription) {
  try {
    const result = await db.query(`
      UPDATE tenants 
      SET subscription_status = $1,
        stripe_subscription_id = $2,
        updated_at = NOW()
      WHERE stripe_customer_id = $3
      RETURNING *
    `, [subscription.status, subscription.id, subscription.customer]);

    if (result.rows.length > 0) {
      console.log(`Subscription updated for tenant: ${result.rows[0].id}`);
    }
  } catch (error) {
    console.error('Error handling subscription updated:', error);
  }
}

// Handle subscription deletion
async function handleSubscriptionDeleted(subscription) {
  try {
    const result = await db.query(`
      UPDATE tenants 
      SET subscription_status = 'canceled',
        updated_at = NOW()
      WHERE stripe_customer_id = $1
      RETURNING *
    `, [subscription.customer]);

    if (result.rows.length > 0) {
      console.log(`Subscription canceled for tenant: ${result.rows[0].id}`);
      
      // Create notification for tenant admin
      await db.query(`
        INSERT INTO notifications (user_id, notification_type, title, message, data)
        SELECT u.id, 'subscription_canceled', 'Subscription Canceled', 
               'Your subscription has been canceled. Your access will be limited.',
               '{"subscription_id": $1}'
        FROM users u
        WHERE u.tenant_id = $2 AND u.role = 'parent'
        LIMIT 1
      `, [subscription.id, result.rows[0].id]);
    }
  } catch (error) {
    console.error('Error handling subscription deleted:', error);
  }
}

// GET /api/billing/invoices - Get tenant invoices (protected route)
router.get('/invoices', async (req, res) => {
  try {
    // This would require authentication middleware
    // For now, we'll return a placeholder
    res.json({ message: 'Invoices endpoint - requires authentication' });
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ message: 'Failed to fetch invoices' });
  }
});

// POST /api/billing/create-payment-intent - Create payment intent (protected route)
router.post('/create-payment-intent', async (req, res) => {
  try {
    // This would require authentication middleware
    // For now, we'll return a placeholder
    res.json({ message: 'Create payment intent endpoint - requires authentication' });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ message: 'Failed to create payment intent' });
  }
});

module.exports = router; 
