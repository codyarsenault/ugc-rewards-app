import { ShopInstallationsModel } from '../models/shopInstallations.js';
import { getPlanFlags, getPlanLimits } from '../config/plans.js';

export async function attachPlan(req, res, next) {
  try {
    const shop = res.locals?.shopify?.session?.shop;
    const install = shop ? await ShopInstallationsModel.getByShop(shop) : null;
    const plan = (install?.plan_name || 'starter').toLowerCase();
    req.plan = plan;
    req.planFlags = getPlanFlags(plan);
    req.planLimits = getPlanLimits(plan);
    next();
  } catch (e) {
    console.error('attachPlan error', e);
    next();
  }
}

export function requireFeature(featurePath) {
  return (req, res, next) => {
    const allow = featurePath.split('.').reduce((acc, part) => acc && acc[part], req.planFlags);
    if (!allow) return res.status(402).json({ error: 'UPGRADE_REQUIRED', message: 'This feature requires a higher plan.' });
    next();
  };
}

export function enforceLimit(limitKey, currentValue) {
  return (req, res, next) => {
    const limit = req.planLimits?.[limitKey];
    if (typeof limit === 'number' && currentValue >= limit) {
      return res.status(402).json({ error: 'LIMIT_REACHED', message: `Limit reached for ${limitKey}.` });
    }
    next();
  };
} 