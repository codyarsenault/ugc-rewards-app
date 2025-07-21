import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

export async function sendNotificationEmail({ to, subject, text, html }) {
  const msg = {
    to: to || process.env.EMAIL_TO,
    from: process.env.EMAIL_FROM,
    subject,
    text,
    html,
  };
  return sgMail.send(msg);
}

export async function sendCustomerConfirmationEmail({ to, customerName, type }) {
  const msg = {
    to,
    from: process.env.EMAIL_FROM,
    subject: 'Thank you for your submission!',
    text: `Thank you for sharing your experience! Your ${type} submission has been received and is pending review.`,
    html: `<p>Thank you for sharing your experience!</p><p>Your <b>${type}</b> submission has been received and is pending review.</p>`
  };
  return sgMail.send(msg);
}

export async function sendCustomerStatusEmail({ to, status, type, additionalMessage = '' }) {
  console.log('=== sendCustomerStatusEmail called ===');
  console.log('Parameters:', { to, status, type, additionalMessage });
  
  let subject, text, html;
  
  if (status === 'approved') {
    subject = '🎉 Your submission has been approved!';
    text = `Congratulations! Your ${type} submission has been approved.${additionalMessage ? ' ' + additionalMessage : ''}`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🎉 Congratulations!</h2>
        <p style="font-size: 16px; line-height: 1.6;">Your <b>${type}</b> submission has been <b>approved</b>!</p>
        
        ${additionalMessage ? `
          <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #008060;">
            <p style="margin: 0; color: #333; font-size: 16px; line-height: 1.5;">
              <strong>What's Next:</strong><br>
              ${additionalMessage}
            </p>
          </div>
        ` : ''}
        
        <p style="color: #666; margin-top: 20px;">Thank you for sharing your amazing content with us! We truly appreciate your contribution to our community.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from UGC Rewards.</p>
      </div>
    `;
  } else if (status === 'rejected') {
    subject = 'Update on your submission';
    text = `Thank you for your submission. Unfortunately, your ${type} submission was not approved at this time. We encourage you to try again!`;
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Submission Update</h2>
        <p>Thank you for your submission. Unfortunately, your <b>${type}</b> submission was not approved at this time.</p>
        <p>We encourage you to review our guidelines and submit again. We'd love to see more content from you!</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from UGC Rewards.</p>
      </div>
    `;
  } else {
    subject = 'Submission status update';
    text = `Your ${type} submission status: ${status}`;
    html = `<p>Your <b>${type}</b> submission status: <b>${status}</b></p>`;
  }
  
  const msg = {
    to,
    from: process.env.EMAIL_FROM,
    subject,
    text,
    html,
  };
  
  return sgMail.send(msg);
}

export async function sendGiftCardEmail({ to, code, amount }) {
  const msg = {
    from: process.env.EMAIL_FROM,
    to: to,
    subject: '🎁 Your Gift Card is Here!',
    text: `Congratulations! Your gift card for $${amount} is ready. Gift card code: ${code}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🎁 Your Gift Card Has Arrived!</h2>
        <p>Thank you for your amazing UGC submission! Here's your gift card:</p>
        
        <div style="background: #f5f5f5; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <p style="color: #666; margin: 0 0 10px 0;">Gift Card Code:</p>
          <h1 style="color: #008060; margin: 0; font-size: 32px; letter-spacing: 2px;">${code}</h1>
          <p style="font-size: 24px; margin: 15px 0 5px 0; color: #333;">Value: $${amount}</p>
        </div>
        
        <p><strong>How to use your gift card:</strong></p>
        <ol>
          <li>Shop our collection</li>
          <li>At checkout, enter the gift card code above</li>
          <li>The gift card value will be applied to your order</li>
        </ol>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This gift card does not expire. If you have any questions, please contact our support team.
        </p>
      </div>
    `
  };
  
  return sgMail.send(msg);
}

export async function sendRewardCodeEmail({ to, code, value, type, expiresIn }) {
  const valueText = type === 'percentage' ? `${value}%` : `$${value}`;
  
  const msg = {
    from: process.env.EMAIL_FROM,
    to: to,
    subject: '🎉 Your UGC Reward is Here!',
    text: `Congratulations! Your content has been approved. Here's your reward code: ${code}. Get ${valueText} off your next purchase. This code expires in ${expiresIn}.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🎉 Your Content Was Approved!</h2>
        <p>Thank you for sharing your amazing content with us. As promised, here's your reward:</p>
        
        <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="color: #008060; margin: 0; font-size: 32px;">${code}</h1>
          <p style="font-size: 24px; margin: 10px 0; color: #666;">${valueText} OFF</p>
          <p style="color: #999; margin: 0;">Valid for ${expiresIn}</p>
        </div>
        
        <p>To use this code:</p>
        <ol>
          <li>Shop our collection</li>
          <li>Add items to your cart</li>
          <li>Enter code <strong>${code}</strong> at checkout</li>
        </ol>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This code is single-use and expires in ${expiresIn}. Cannot be combined with other offers.
        </p>
      </div>
    `
  };
  
  return sgMail.send(msg);
}