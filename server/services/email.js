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

export async function sendCustomerStatusEmail({ to, status, type }) {
  let subject, text, html;
  if (status === 'approved') {
    subject = 'Your submission has been approved!';
    text = `Congratulations! Your ${type} submission has been approved.`;
    html = `<p>Congratulations! Your <b>${type}</b> submission has been <b>approved</b>.</p>`;
  } else if (status === 'rejected') {
    subject = 'Your submission has been rejected';
    text = `We're sorry, but your ${type} submission was not approved.`;
    html = `<p>We're sorry, but your <b>${type}</b> submission was <b>not approved</b>.</p>`;
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