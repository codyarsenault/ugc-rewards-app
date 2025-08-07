import sgMail from '@sendgrid/mail';
import dotenv from 'dotenv';

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Helper function to get email configuration
function getEmailConfig(customizations) {
  const fromEmail = process.env.EMAIL_FROM;
  const fromName = customizations?.email_from_name || process.env.EMAIL_FROM_NAME || 'Honest UGC';
  const replyTo = customizations?.email_reply_to || null; // null means no-reply
  
  return {
    from: {
      email: fromEmail,
      name: fromName
    },
    ...(replyTo && { replyTo }) // Only include replyTo if it exists
  };
}

export async function sendNotificationEmail({ to, subject, text, html }) {
  if (!to) {
    throw new Error('Notification email recipient is required');
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

export async function sendCustomerConfirmationEmail({ to, customerName, type, customSubject, customBody, customizations }) {
  console.log('=== sendCustomerConfirmationEmail called ===');
  console.log('Parameters:', { to, customerName, type, customSubject, customBody });
  console.log('Customizations:', customizations);
  
  const emailConfig = getEmailConfig(customizations);
  
  let subject, text, html;
  
  // If custom content is provided, use it with variable substitution
  if (customBody) {
    console.log('🎨 Using custom confirmation email body:', customBody);
    console.log('🔧 Variables to substitute:');
    console.log('  - type:', type);
    
    const processedBody = customBody
      .replace(/\{type\}/g, type);
    
    console.log('📝 Processed confirmation email body:', processedBody);
    
    const msg = {
      to,
      ...emailConfig,
      subject: customSubject || 'Thank you for your submission!',
      text: processedBody.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          ${processedBody}
        </div>
      `
    };
    return sgMail.send(msg);
  }
  
  // Default content if no custom content provided
  subject = customSubject || 'Thank you for your submission!';
  text = `Thank you for sharing your experience! Your ${type} submission has been received and is pending review.`;
  html = `<p>Thank you for sharing your experience!</p><p>Your <b>${type}</b> submission has been received and is pending review.</p>`;
  
  const msg = {
    to,
    ...emailConfig,
    subject,
    text,
    html
  };
  return sgMail.send(msg);
}

export async function sendCustomerStatusEmail({ 
  to, 
  status, 
  type, 
  additionalMessage = '', 
  customSubject, 
  customBody, 
  discountCode = null, 
  rewardValue = null,
  productTitle = null,
  giftCardCode = null,
  amount = null,
  customizations 
}) {
  console.log('=== sendCustomerStatusEmail called ===');
  console.log('Parameters:', { to, status, type, additionalMessage, customSubject, customBody, discountCode, rewardValue, productTitle, giftCardCode, amount });
  
  const emailConfig = getEmailConfig(customizations);
  
  let subject, text, html;
  
  // If custom content is provided, use it with variable substitution
  if (customBody) {
    console.log('🎨 Using custom email body:', customBody);
    console.log('🔧 Variables to substitute:');
    console.log('  - type:', type);
    console.log('  - status:', status);
    console.log('  - discount_code:', discountCode);
    console.log('  - reward_value:', rewardValue);
    console.log('  - product_title:', productTitle);
    console.log('  - gift_card_code:', giftCardCode);
    console.log('  - amount:', amount);
    
    const processedBody = customBody
      .replace(/\{type\}/g, type || '')
      .replace(/\{status\}/g, status || '')
      .replace(/\{discount_code\}/g, discountCode || '')
      .replace(/\{reward_value\}/g, rewardValue || '')
      .replace(/\{product_title\}/g, productTitle || '')
      .replace(/\{gift_card_code\}/g, giftCardCode || '')
      .replace(/\{amount\}/g, amount || '');
    
    console.log('📝 Processed email body:', processedBody);
    
    const msg = {
      to,
      ...emailConfig,
      subject: customSubject || 'Submission status update',
      text: processedBody.replace(/<[^>]*>/g, ''), // Strip HTML for text version
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          ${processedBody}
        </div>
      `
    };
    return sgMail.send(msg);
  }
  
  if (status === 'approved') {
    subject = customSubject || '🎉 Your submission has been approved!';
    const bodyText = `Congratulations! Your ${type} submission has been approved.${additionalMessage ? ' ' + additionalMessage : ''}`;
    text = bodyText;
    
    console.log('Email service - discount code received:', discountCode);
    console.log('Email service - additional message:', additionalMessage);
    html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🎉 Congratulations!</h2>
        <p style="font-size: 16px; line-height: 1.6;">Your <b>${type}</b> submission has been <b>approved</b>!</p>
        
        ${discountCode ? `
          <div style="background: #f5f5f5; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
            <p style="color: #666; margin: 0 0 10px 0;">Your Discount Code:</p>
            <h1 style="color: #008060; margin: 0; font-size: 32px; letter-spacing: 2px;">${discountCode}</h1>
            <p style="font-size: 18px; margin: 15px 0 5px 0; color: #333;">100% OFF</p>
            <p style="color: #999; margin: 0;">Valid for 30 days</p>
          </div>
        ` : ''}
        
        ${additionalMessage ? `
          <div style="background: #f0f8ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #008060;">
            <p style="margin: 0; color: #333; font-size: 16px; line-height: 1.5;">
              <strong>What's Next:</strong><br>
              ${additionalMessage}
            </p>
          </div>
        ` : ''}
        
        ${discountCode ? `
          <p><strong>How to use your discount code:</strong></p>
          <ol>
            <li>Shop our collection</li>
            <li>Add items to your cart</li>
            <li>Enter code <strong>${discountCode}</strong> at checkout</li>
          </ol>
        ` : ''}
        
        <p style="color: #666; margin-top: 20px;">Thank you for sharing your amazing content with us! We truly appreciate your contribution to our community.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from Honest UGC.</p>
      </div>
    `;
  } else if (status === 'rejected') {
    subject = customSubject || 'Update on your submission';
    const bodyText = customBody || `Thank you for your submission. Unfortunately, your ${type} submission was not approved at this time. We encourage you to try again!`;
    text = bodyText;
    html = customBody ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p style="font-size: 16px; line-height: 1.6;">${customBody}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from Honest UGC.</p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Submission Update</h2>
        <p>Thank you for your submission. Unfortunately, your <b>${type}</b> submission was not approved at this time.</p>
        <p>We encourage you to review our guidelines and submit again. We'd love to see more content from you!</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #999; font-size: 12px; text-align: center;">This is an automated message from Honest UGC.</p>
      </div>
    `;
  } else {
    subject = customSubject || 'Submission status update';
    const bodyText = customBody || `Your ${type} submission status: ${status}`;
    text = bodyText;
    html = customBody ? `<p>${customBody}</p>` : `<p>Your <b>${type}</b> submission status: <b>${status}</b></p>`;
  }
  
  const msg = {
    to,
    ...emailConfig,
    subject,
    text,
    html,
  };
  
  return sgMail.send(msg);
}

export async function sendGiftCardEmail({ to, code, amount, customSubject, customBody, customizations }) {
  const emailConfig = getEmailConfig(customizations);
  
  // Process custom body with variable substitution
  let processedBody = customBody;
  let processedSubject = customSubject;
  
  if (customBody) {
    console.log('🎨 Processing gift card email variables');
    processedBody = customBody
      .replace(/\{gift_card_code\}/g, code || '')
      .replace(/\{amount\}/g, amount || '');
  }
  
  if (customSubject) {
    processedSubject = customSubject
      .replace(/\{gift_card_code\}/g, code || '')
      .replace(/\{amount\}/g, amount || '');
  }
  
  const msg = {
    to: to,
    ...emailConfig,
    subject: processedSubject || '🎁 Your Gift Card is Here!',
    text: processedBody ? `${processedBody}\n\nGift card code: ${code}\nValue: $${amount}` : `Congratulations! Your gift card for $${amount} is ready. Gift card code: ${code}`,
    html: processedBody ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p style="font-size: 16px; line-height: 1.6;">${processedBody}</p>
        
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
    ` : `
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

export async function sendRewardCodeEmail({ to, code, value, type, expiresIn, productTitle = null, customSubject, customBody, customizations }) {
  const emailConfig = getEmailConfig(customizations);
  const valueText = type === 'percentage' ? `${value}%` : `$${value}`;
  
  // Process custom body with variable substitution
  let processedBody = customBody;
  let processedSubject = customSubject;
  
  if (customBody) {
    console.log('🎨 Processing reward email variables');
    processedBody = customBody
      .replace(/\{discount_code\}/g, code || '')
      .replace(/\{reward_value\}/g, valueText || '')
      .replace(/\{product_title\}/g, productTitle || '');
  }
  
  if (customSubject) {
    processedSubject = customSubject
      .replace(/\{discount_code\}/g, code || '')
      .replace(/\{reward_value\}/g, valueText || '')
      .replace(/\{product_title\}/g, productTitle || '');
  }
  
  const msg = {
    to: to,
    ...emailConfig,
    subject: processedSubject || '🎉 Your UGC Reward is Here!',
    text: processedBody ? `${processedBody}\n\nCode: ${code}\nValue: ${valueText} off\nExpires: ${expiresIn}` : `Congratulations! Your content has been approved. Here's your reward code: ${code}. Get ${valueText} off your next purchase. This code expires in ${expiresIn}.`,
    html: processedBody ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p style="font-size: 16px; line-height: 1.6;">${processedBody}</p>
        
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
    ` : `
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

export async function sendFreeProductEmail({ to, code, productName, customSubject, customBody, customizations }) {
  console.log('=== sendFreeProductEmail called ===');
  console.log('Parameters:', { to, code, productName, customSubject, customBody });
  
  const emailConfig = getEmailConfig(customizations);
  
  const msg = {
    to: to,
    ...emailConfig,
    subject: customSubject || '🎁 Your Free Product Code is Here!',
    text: customBody ? `${customBody}\n\nDiscount code: ${code}\nProduct: ${productName}` : `Congratulations! Your free ${productName} is ready. Use discount code: ${code} at checkout for 100% off.`,
    html: customBody ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <p style="font-size: 16px; line-height: 1.6;">${customBody}</p>
        
        <div style="background: #f5f5f5; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <p style="color: #666; margin: 0 0 10px 0;">Your Free Product Code:</p>
          <h1 style="color: #008060; margin: 0; font-size: 32px; letter-spacing: 2px;">${code}</h1>
          <p style="font-size: 18px; margin: 15px 0 5px 0; color: #333;">100% OFF ${productName}</p>
          <p style="color: #999; margin: 0;">Valid for 30 days</p>
        </div>
        
        <p><strong>How to claim your free product:</strong></p>
        <ol>
          <li>Visit our store and find "${productName}"</li>
          <li>Add it to your cart</li>
          <li>Enter code <strong>${code}</strong> at checkout</li>
          <li>The product will be free (100% discount applied)</li>
        </ol>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This code is valid for 30 days and can only be used once. It applies only to "${productName}".
        </p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">🎁 Your Free Product is Ready!</h2>
        <p>Thank you for your amazing UGC submission! As promised, here's your code for a free ${productName}:</p>
        
        <div style="background: #f5f5f5; padding: 30px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <p style="color: #666; margin: 0 0 10px 0;">Your Free Product Code:</p>
          <h1 style="color: #008060; margin: 0; font-size: 32px; letter-spacing: 2px;">${code}</h1>
          <p style="font-size: 18px; margin: 15px 0 5px 0; color: #333;">100% OFF ${productName}</p>
          <p style="color: #999; margin: 0;">Valid for 30 days</p>
        </div>
        
        <p><strong>How to claim your free product:</strong></p>
        <ol>
          <li>Visit our store and find "${productName}"</li>
          <li>Add it to your cart</li>
          <li>Enter code <strong>${code}</strong> at checkout</li>
          <li>The product will be free (100% discount applied)</li>
        </ol>
        
        <p style="color: #666; font-size: 14px; margin-top: 30px;">
          This code is valid for 30 days and can only be used once. It applies only to "${productName}".
        </p>
      </div>
    `
  };
  
  return sgMail.send(msg);
}