import { shopifyApp } from '@shopify/shopify-app-express';
import { RewardsModel } from '../models/rewards.js';

export class ShopifyDiscountService {
  constructor(session) {
    this.session = session;
  }

  generateUniqueCode(submissionId) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `UGC${submissionId}${timestamp}${random}`;
  }

  async createDiscountCode(job, submission) {
    try {
      const code = this.generateUniqueCode(submission.id);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      
      // Create GraphQL client
      const client = new this.session.client;
      
      // Create price rule using GraphQL
      const priceRuleInput = {
        title: `UGC Reward - ${submission.customer_email}`,
        combinesWith: {
          productDiscounts: true,
          shippingDiscounts: false
        },
        startsAt: new Date().toISOString(),
        endsAt: expiresAt.toISOString(),
        usageLimit: 1,
        customerSelection: {
          all: true
        }
      };

      let discountInput;
      
      if (job.reward_type === 'percentage') {
        discountInput = {
          percentageBasicInput: {
            percentage: job.reward_value / 100,
            minimumSubtotal: {
              amount: 0.01,
              currencyCode: "USD"
            }
          }
        };
      } else if (job.reward_type === 'fixed') {
        discountInput = {
          amountBasicInput: {
            amount: {
              amount: job.reward_value,
              currencyCode: "USD"
            },
            appliesOnEachItem: false,
            minimumSubtotal: {
              amount: job.reward_value,
              currencyCode: "USD"
            }
          }
        };
      }

      // GraphQL mutation to create discount
      const mutation = `
        mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  codes(first: 1) {
                    nodes {
                      id
                      code
                    }
                  }
                  customerGets {
                    value {
                      ... on DiscountPercentage {
                        percentage
                      }
                      ... on DiscountAmount {
                        amount {
                          amount
                          currencyCode
                        }
                      }
                    }
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const variables = {
        basicCodeDiscount: {
          code: code,
          title: priceRuleInput.title,
          combinesWith: priceRuleInput.combinesWith,
          startsAt: priceRuleInput.startsAt,
          endsAt: priceRuleInput.endsAt,
          usageLimit: priceRuleInput.usageLimit,
          customerSelection: priceRuleInput.customerSelection,
          customerGets: {
            value: job.reward_type === 'percentage' 
              ? { percentage: job.reward_value / 100 }
              : { discountAmount: { amount: job.reward_value, appliesOnEachItem: false } },
            items: {
              all: true
            }
          }
        }
      };

      const response = await client.request(mutation, { variables });

      if (response.data.discountCodeBasicCreate.userErrors.length > 0) {
        throw new Error(response.data.discountCodeBasicCreate.userErrors[0].message);
      }

      const discountNode = response.data.discountCodeBasicCreate.codeDiscountNode;
      
      // Save to database
      await RewardsModel.create({
        submissionId: submission.id,
        jobId: job.id,
        type: 'discount_code',
        code: code,
        value: job.reward_value,
        status: 'pending',
        expiresAt: expiresAt,
        shopifyPriceRuleId: discountNode.id,
        shopifyDiscountCodeId: discountNode.codeDiscount.codes.nodes[0].id
      });

      return {
        code: code,
        expiresAt: expiresAt,
        value: job.reward_value,
        type: job.reward_type
      };
    } catch (error) {
      console.error('Error creating discount code:', error);
      throw error;
    }
  }
}