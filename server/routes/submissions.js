import express from 'express';
import { SubmissionsModel } from '../models/submissions.js';
import { JobsModel } from '../models/jobs.js';
import { CustomizationsModel } from '../models/customizations.js';
import { RewardsModel } from '../models/rewards.js';
import { ShopifyDiscountService } from '../services/shopifyDiscount.js';
import {
  sendNotificationEmail,
  sendCustomerStatusEmail,
  sendRewardCodeEmail,
  sendGiftCardEmail,
  sendFreeProductEmail,
} from '../services/email.js';
import { shopifyApp } from '@shopify/shopify-app-express';
import { getPlanFlags, getPlanLimits } from '../config/plans.js';
import { ShopInstallationsModel } from '../models/shopInstallations.js';

export const adminSubmissionRoutes = express.Router();

// Get submissions
adminSubmissionRoutes.get('/submissions', async (req, res) => {
  try {
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submissions = await SubmissionsModel.getByShop(shop);
    
    const transformedSubmissions = submissions.map(sub => ({
      id: sub.id,
      shop_submission_number: sub.shop_submission_number,
      customerEmail: sub.customer_email,
      paypal_email: sub.paypal_email || null,
      type: sub.type,
      content: sub.content,
      status: sub.status,
      mediaUrl: sub.media_url,
      createdAt: sub.created_at,
      job_title: sub.job_title,
      job_id: sub.job_id,
      reward_type: sub.reward_type || null,
      reward_fulfilled: sub.reward_fulfilled || false,
      reward_paypal_transaction_id: sub.reward_paypal_transaction_id || null
    }));
    
    res.json({ submissions: transformedSubmissions });
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Failed to fetch submissions' });
  }
});

// Approve submission
adminSubmissionRoutes.post('/submissions/:id/approve', async (req, res) => {
  try {
    const submissionId = req.params.id;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    // Enforce monthly approvals limit
    const install = await ShopInstallationsModel.getByShop(shop);
    const plan = (install?.plan_name || 'starter').toLowerCase();
    const limits = getPlanLimits(plan);
    const approvedThisMonth = await SubmissionsModel.countApprovedThisMonthByShop(shop);
    if (typeof limits.monthlyApprovals === 'number' && approvedThisMonth >= limits.monthlyApprovals) {
      return res.status(402).json({ success: false, message: `Your plan allows ${limits.monthlyApprovals} approvals per month.` });
    }
    
    // Note: We need to get the shopify instance from somewhere
    // You might need to pass it through middleware or import it
    const shopify = req.app.get('shopify'); // This assumes you set it in index.js
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to approve this submission' });
      }
    }

    let job = null;
    let approvalSuccessful = false;
    let rewardSentSuccessfully = false;
    let errorMessage = null;

    if (submission.job_id) {
      job = await JobsModel.getById(submission.job_id);

      if (['percentage', 'fixed'].includes(job.reward_type)) {
        try {
          const client = new shopify.api.clients.Graphql({ session });
          const discountService = new ShopifyDiscountService(client);

          const { code } = await discountService.createDiscountCode(job, submission);
          
          const customizations = await CustomizationsModel.getByShop(shop) || {};
          
          console.log('📧 Sending reward email to:', submission.customer_email);
          await sendRewardCodeEmail({
            to: submission.customer_email,
            code,
            value: job.reward_value,
            type: job.reward_type,
            submissionType: submission.type, // Add submission type for {type} variable
            expiresIn: '30 days',
            productTitle: job.reward_product || null,
            customSubject: customizations.email_subject_reward,
            customBody: customizations.email_body_reward,
            customizations
          });
          console.log('✅ Reward email sent successfully');

          const reward = await RewardsModel.getBySubmissionId(submission.id);
          if (reward) {
            await RewardsModel.markAsSent(reward.id);
            await RewardsModel.updateSubmissionRewardStatus(submission.id);
          }

          rewardSentSuccessfully = true;
        } catch (err) {
          console.error('Error creating/sending reward:', err);
          errorMessage = 'Failed to create or send discount code. The submission remains pending.';
          
          await RewardsModel.create({
            submissionId: submission.id,
            jobId: job.id,
            type: job.reward_type,
            code: null,
            value: job.reward_value,
            status: 'pending_fulfillment',
            expiresAt: null,
            sentAt: null
          });
        }
      }
      else if (job.reward_type === 'giftcard') {
        try {
          await RewardsModel.create({
            submissionId: submission.id,
            jobId: job.id,
            type: 'giftcard',
            code: null,
            value: job.reward_giftcard_amount,
            status: 'pending_fulfillment',
            expiresAt: null,
            shopifyPriceRuleId: null,
            shopifyDiscountCodeId: null
          });
          
          const customizations = await CustomizationsModel.getByShop(shop) || {};
          const notificationEmailTo = customizations.notification_email;
          
          if (notificationEmailTo) {
            await sendNotificationEmail({
              to: notificationEmailTo,
              subject: 'Manual Gift Card Required - Honest UGC',
              html: `
                <h2>Gift Card Needs to be Created</h2>
                <p>A gift card needs to be manually created for an approved UGC submission:</p>
                <ul>
                  <li><strong>Customer:</strong> ${submission.customer_email}</li>
                  <li><strong>Amount:</strong> $${job.reward_giftcard_amount}</li>
                  <li><strong>Job:</strong> ${job.title}</li>
                  <li><strong>Submission ID:</strong> #${submission.shop_submission_number || submission.id}</li>
                </ul>
                <p><strong>Action Required:</strong></p>
                <ol>
                  <li>Go to Shopify Admin > Products > Gift cards</li>
                  <li>Create a new gift card for $${job.reward_giftcard_amount}</li>
                  <li>Return to Honest UGC and click "Send Gift Card Email" on this submission</li>
                </ol>
              `
            });
          }
          
          rewardSentSuccessfully = true;
        } catch (error) {
          console.error('Error processing gift card reward:', error);
          errorMessage = 'Failed to process gift card reward. The submission remains pending.';
        }
      }
      else if (job.reward_type === 'cash') {
        // Ensure plan supports cash rewards (secondary check)
        const install = await ShopInstallationsModel.getByShop(shop);
        const plan = (install?.plan_name || 'starter').toLowerCase();
        const flags = getPlanFlags(plan);
        if (!flags?.rewards?.cash) {
          return res.status(402).json({ success: false, message: 'Cash rewards require the Pro plan.' });
        }
        try {
          await RewardsModel.create({
            submissionId: submission.id,
            jobId: job.id,
            type: 'cash',
            code: null,
            value: job.reward_cash_amount || job.reward_value || 0,
            status: 'pending_fulfillment',
            expiresAt: null
          });
          
          // Notify admin that a manual cash payout is required
          const customizations = await CustomizationsModel.getByShop(shop) || {};
          const notificationEmailTo = customizations.notification_email;
          if (notificationEmailTo) {
            const amountDisplay = job.reward_cash_amount || job.reward_value || 0;
            const paypalEmailText = submission.paypal_email ? `<li><strong>PayPal Email:</strong> ${submission.paypal_email}</li>` : '';
            await sendNotificationEmail({
              to: notificationEmailTo,
              subject: 'Manual Cash Payout Required - Honest UGC',
              html: `
                <h2>Cash Reward Needs to be Paid</h2>
                <p>A manual cash reward needs to be fulfilled for an approved UGC submission:</p>
                <ul>
                  <li><strong>Customer:</strong> ${submission.customer_email}</li>
                  <li><strong>Amount:</strong> $${amountDisplay}</li>
                  ${paypalEmailText}
                  <li><strong>Job:</strong> ${job.title}</li>
                  <li><strong>Submission ID:</strong> #${submission.shop_submission_number || submission.id}</li>
                </ul>
                <p><strong>Action Required:</strong></p>
                <ol>
                  <li>Send $${amountDisplay} via PayPal to the email above (if provided).</li>
                  <li>Return to Honest UGC and enter the PayPal Transaction ID, then click "Mark/Update Transaction ID" on this submission.</li>
                </ol>
              `
            });
          }
          
          // For cash payouts, do not send any customer email from the system; admin will pay via PayPal
          // Keep rewardSentSuccessfully true to mark approval but we'll keep view logic pending until fulfilled
          rewardSentSuccessfully = true;
        } catch (error) {
          console.error('Error processing cash reward:', error);
          errorMessage = 'Failed to create cash reward record. The submission remains pending.';
        }
      }
      else if (job.reward_type === 'product') {
        try {
          const client = new shopify.api.clients.Graphql({ session });
          const discountService = new ShopifyDiscountService(client);
          
          const { code } = await discountService.createProductDiscountCode(job, submission);
          
          const customizations = await CustomizationsModel.getByShop(shop) || {};

          await sendFreeProductEmail({
            to: submission.customer_email,
            code: code,
            productName: job.reward_product,
            customSubject: customizations.email_subject_product,
            customBody: customizations.email_body_product,
            customizations
          });

          const reward = await RewardsModel.getBySubmissionId(submission.id);
          if (reward) {
            await RewardsModel.markAsSent(reward.id);
            await RewardsModel.updateSubmissionRewardStatus(submission.id);
          }
          
          rewardSentSuccessfully = true;
        } catch (error) {
          console.error('Error creating free product reward:', error);
          errorMessage = 'Failed to create or send free product code. The submission remains pending.';
          
          await RewardsModel.create({
            submissionId: submission.id,
            jobId: job.id,
            type: 'product',
            code: null,
            value: 0,
            status: 'pending_fulfillment',
            expiresAt: null,
            sentAt: null
          });
        }
      }
      else {
        rewardSentSuccessfully = true;
      }

      if (rewardSentSuccessfully) {
        await SubmissionsModel.updateStatus(submissionId, 'approved');
        await JobsModel.incrementSpotsFilled(submission.job_id);
        
        const updatedJob = await JobsModel.getById(submission.job_id);
        if (updatedJob.spots_filled >= updatedJob.spots_available) {
          await JobsModel.updateStatus(updatedJob.id, 'completed');
        }
        
        approvalSuccessful = true;
      }
    } else {
      await SubmissionsModel.updateStatus(submissionId, 'approved');
      approvalSuccessful = true;
    }

    if (approvalSuccessful) {
      res.json({ success: true, message: 'Submission approved successfully' });
    } else {
      res.status(500).json({ 
        success: false, 
        message: errorMessage || 'Failed to approve submission due to reward processing error',
        keepPending: true 
      });
    }
  } catch (error) {
    console.error('Error approving submission:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to approve submission',
      error: error.message 
    });
  }
});

// Reject submission
adminSubmissionRoutes.post('/submissions/:id/reject', async (req, res) => {
  try {
    const submissionId = req.params.id;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ success: false, message: 'Submission not found' });
    }

    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to reject this submission' });
      }
    }
    
    if (submission.status === 'approved' && submission.job_id) {
      await JobsModel.decrementSpotsFilled(submission.job_id);
      
      const job = await JobsModel.getById(submission.job_id);
      if (job && job.status === 'completed' && job.spots_filled < job.spots_available) {
        await JobsModel.updateStatus(submission.job_id, 'active');
      }
    }
    
    await SubmissionsModel.updateStatus(submissionId, 'rejected');

    const customizations = await CustomizationsModel.getByShop(shop) || {};
    
    await sendCustomerStatusEmail({
      to: submission.customer_email,
      status: 'rejected',
      type: submission.type,
      customSubject: customizations.email_subject_rejected,
      customBody: customizations.email_body_rejected,
      customizations
    });
    
    res.json({ success: true, message: 'Submission rejected' });
  } catch (error) {
    console.error('Error rejecting submission:', error);
    res.status(500).json({ success: false, message: 'Failed to reject submission' });
  }
});

// Send gift card email
adminSubmissionRoutes.post('/rewards/:submissionId/send-giftcard', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { giftCardCode, amount } = req.body;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to access this submission' });
      }
    }
    
    const customizations = await CustomizationsModel.getByShop(shop) || {};
    
    await sendGiftCardEmail({
      to: submission.customer_email,
      code: giftCardCode,
      amount: amount,
      customSubject: customizations.email_subject_giftcard,
      customBody: customizations.email_body_giftcard,
      customizations
    });
    
    const reward = await RewardsModel.getBySubmissionId(submissionId);
    if (reward) {
      await RewardsModel.update(reward.id, {
        code: giftCardCode,
        status: 'fulfilled',
        fulfilled_at: new Date()
      });
    }
    
    await SubmissionsModel.update(submissionId, {
      reward_fulfilled: true,
      reward_fulfilled_at: new Date()
    });
    
    res.json({ success: true, message: 'Gift card email sent successfully' });
  } catch (error) {
    console.error('Error sending gift card email:', error);
    res.status(500).json({ error: 'Failed to send gift card email' });
  }
});

// Mark cash reward as fulfilled with PayPal transaction id
adminSubmissionRoutes.post('/rewards/:submissionId/cash-fulfill', async (req, res) => {
  try {
    const { submissionId } = req.params;
    const { transactionId } = req.body;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    if (!transactionId) {
      return res.status(400).json({ error: 'Transaction ID is required' });
    }
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }
    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to access this submission' });
      }
      if (job.reward_type !== 'cash') {
        return res.status(400).json({ error: 'This submission is not a cash reward type' });
      }
    }
    const reward = await RewardsModel.getBySubmissionId(submissionId);
    if (!reward) {
      return res.status(400).json({ error: 'No reward record found for this submission' });
    }
    await RewardsModel.update(reward.id, {
      status: 'fulfilled',
      fulfilled_at: new Date(),
      paypal_transaction_id: transactionId,
      paypal_email: submission.paypal_email || null
    });
    await SubmissionsModel.update(submissionId, {
      reward_fulfilled: true,
      reward_fulfilled_at: new Date()
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Error marking cash fulfilled:', error);
    res.status(500).json({ error: 'Failed to mark as fulfilled' });
  }
});

// Resend rejection email
adminSubmissionRoutes.post('/submissions/:id/resend-rejection', async (req, res) => {
  try {
    const submissionId = req.params.id;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to access this submission' });
      }
    }

    if (submission.status !== 'rejected') {
      return res.status(400).json({ error: 'Can only resend rejection emails for rejected submissions' });
    }
    
    const customizations = await CustomizationsModel.getByShop(shop) || {};
    
    await sendCustomerStatusEmail({
      to: submission.customer_email,
      status: 'rejected',
      type: submission.type,
      customSubject: customizations.email_subject_rejected,
      customBody: customizations.email_body_rejected,
      customizations
    });
    
    res.json({ success: true, message: 'Rejection email resent successfully' });
  } catch (error) {
    console.error('Error resending rejection email:', error);
    res.status(500).json({ error: 'Failed to resend rejection email' });
  }
});

// Resend reward email
adminSubmissionRoutes.post('/submissions/:id/resend-reward', async (req, res) => {
  try {
    const submissionId = req.params.id;
    const session = res.locals.shopify.session;
    const shop = session.shop;
    
    const submission = await SubmissionsModel.getById(submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (submission.job_id) {
      const job = await JobsModel.getById(submission.job_id);
      if (!job || job.shop_domain !== shop) {
        return res.status(403).json({ error: 'Unauthorized to access this submission' });
      }
    }

    if (submission.status !== 'approved') {
      return res.status(400).json({ error: 'Can only resend reward emails for approved submissions' });
    }

    if (!submission.job_id) {
      return res.status(400).json({ error: 'No job associated with this submission' });
    }

    const job = await JobsModel.getById(submission.job_id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const customizations = await CustomizationsModel.getByShop(shop) || {};

    if (job.reward_type === 'percentage' || job.reward_type === 'fixed') {
      const reward = await RewardsModel.getBySubmissionId(submission.id);
      if (!reward || !reward.code) {
        return res.status(400).json({ error: 'No discount code found for this submission. The reward may need to be created first.' });
      }

      await sendRewardCodeEmail({
        to: submission.customer_email,
        code: reward.code,
        value: job.reward_value,
        type: job.reward_type,
        submissionType: submission.type, // Add submission type for {type} variable
        expiresIn: '30 days',
        customSubject: customizations.email_subject_reward,
        customBody: customizations.email_body_reward,
        customizations
      });
    } else if (job.reward_type === 'product') {
      const reward = await RewardsModel.getBySubmissionId(submission.id);
      if (!reward || !reward.code) {
        return res.status(400).json({ error: 'No product discount code found for this submission. The reward may need to be created first.' });
      }

      await sendFreeProductEmail({
        to: submission.customer_email,
        code: reward.code,
        productName: job.reward_product,
        customSubject: customizations.email_subject_product,
        customBody: customizations.email_body_product,
        customizations
      });
    } else if (job.reward_type === 'giftcard') {
      return res.status(400).json({ error: 'Please use the "Send Gift Card Email" button to resend gift card emails' });
    }
    
    res.json({ success: true, message: 'Reward email resent successfully' });
  } catch (error) {
    console.error('Error resending reward email:', error);
    res.status(500).json({ error: 'Failed to resend reward email: ' + error.message });
  }
});