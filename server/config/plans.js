export const PLANS = {
  starter: {
    key: 'starter',
    displayName: 'Starter',
    priceAmount: 14.99,
    priceCurrency: 'USD',
    interval: 'EVERY_30_DAYS',
    trialDays: 14,
    limits: {
      maxJobs: 3,
      monthlyApprovals: 3,
    },
    features: {
      jobsCustomization: true,
      rewards: { percentage: true, fixed: true, giftcard: true, product: true, cash: true },
      emailBasic: true,
      prioritySupport: false,
      advancedCss: true,
      exampleVideos: true
    }
  },
  scale: {
    key: 'scale',
    displayName: 'Scale',
    priceAmount: 29.99,
    priceCurrency: 'USD',
    interval: 'EVERY_30_DAYS',
    trialDays: 14,
    limits: {
      maxJobs: 10,
      monthlyApprovals: 10,
    },
    features: {
      jobsCustomization: true,
      rewards: { percentage: true, fixed: true, giftcard: true, product: true, cash: false },
      emailBasic: true,
      prioritySupport: false,
      advancedCss: false,
      exampleVideos: true
    }
  },
  pro: {
    key: 'pro',
    displayName: 'Pro',
    priceAmount: 49.99,
    priceCurrency: 'USD',
    interval: 'EVERY_30_DAYS',
    trialDays: 14,
    limits: {
      maxJobs: Infinity,
      monthlyApprovals: Infinity,
    },
    features: {
      jobsCustomization: true,
      rewards: { percentage: true, fixed: true, giftcard: true, product: true, cash: true },
      emailBasic: true,
      prioritySupport: true,
      advancedCss: true,
      exampleVideos: true
    }
  }
};

export function getPlanFlags(planName) {
  const key = (planName || '').toLowerCase();
  return PLANS[key]?.features || PLANS.starter.features;
}

export function getPlanLimits(planName) {
  const key = (planName || '').toLowerCase();
  return PLANS[key]?.limits || PLANS.starter.limits;
} 