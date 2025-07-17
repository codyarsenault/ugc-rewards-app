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