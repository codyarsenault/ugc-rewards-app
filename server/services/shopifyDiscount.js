// services/shopifyDiscount.js

import { RewardsModel } from '../models/rewards.js';

export class ShopifyDiscountService {
  /**
   * @param {import('@shopify/shopify-api').Clients.Graphql} graphqlClient
   */
  constructor(graphqlClient) {
    this.client = graphqlClient;
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
          title: `UGC Reward - ${submission.customer_email}`,
          code: code,
          startsAt: new Date().toISOString(),
          endsAt: expiresAt.toISOString(),
          usageLimit: 1,
          customerSelection: { all: true },
          combinesWith: {
            orderDiscounts: true,
            productDiscounts: true,
            shippingDiscounts: false
          },
          customerGets: {
            value: job.reward_type === 'percentage'
              ? { percentage: job.reward_value / 100 }
              : { discountAmount: { amount: job.reward_value, appliesOnEachItem: false } },
            items: { all: true }
          }
        }
      };

      const response = await this.client.request(mutation, { variables });
      console.log('Full GraphQL response:', response);

      const mutationResult = response && response.data && response.data.discountCodeBasicCreate;
      if (!mutationResult) {
        throw new Error('discountCodeBasicCreate is missing from the GraphQL response. Full response: ' + JSON.stringify(response));
      }
      const errors = mutationResult.userErrors;
      if (errors.length > 0) {
        throw new Error(errors.map(e => e.message).join('; '));
      }

      const discountNode = mutationResult.codeDiscountNode;
      const codeNode = discountNode.codeDiscount.codes.nodes[0];

      const priceRuleId = discountNode.id;
      const discountCodeId = codeNode.id;

      await RewardsModel.create({
        submissionId: submission.id,
        jobId: job.id,
        type: 'discount_code',
        code,
        value: job.reward_value,
        status: 'pending',
        expiresAt,
        shopifyPriceRuleId: priceRuleId,
        shopifyDiscountCodeId: discountCodeId,
      });

      return { code, expiresAt, value: job.reward_value, type: job.reward_type };
    } catch (error) {
      console.error('Error creating discount code:', error);
      throw error;
    }
  }

  async createProductDiscountCode(job, submission) {
    const code = `UGCFREE${submission.id}${Date.now().toString(36).toUpperCase()}`;
    
    try {
      // Create a 100% discount for the specific product
      const mutation = `
        mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
          discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
            codeDiscountNode {
              id
              codeDiscount {
                ... on DiscountCodeBasic {
                  title
                  codes(first: 1) {
                    edges {
                      node {
                        code
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
          title: `UGC Free Product - ${job.title}`,
          code: code,
          startsAt: new Date().toISOString(),
          endsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          customerSelection: {
            all: true
          },
          customerGets: {
            value: {
              percentage: 1.0  // 100% off
            },
            items: {
              products: {
                productsToAdd: [job.reward_product_id]  // Specific product only
              }
            }
          },
          appliesOncePerCustomer: true,
          usageLimit: 1
        }
      };
      
      const response = await this.client.request(mutation, { variables });
      
      if (response.body.data.discountCodeBasicCreate.userErrors.length > 0) {
        throw new Error(response.body.data.discountCodeBasicCreate.userErrors[0].message);
      }
      
      // Save to database
      await RewardsModel.create({
        submissionId: submission.id,
        jobId: job.id,
        type: 'product',
        code: code,
        value: 0,
        status: 'pending',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        shopifyPriceRuleId: response.body.data.discountCodeBasicCreate.codeDiscountNode.id,
        shopifyDiscountCodeId: response.body.data.discountCodeBasicCreate.codeDiscountNode.id
      });
      
      return { code };
    } catch (error) {
      console.error('Error creating product discount:', error);
      throw error;
    }
  }
}
