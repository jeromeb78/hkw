/* Her Kingdom Wealth™ public runtime config.
   The publishable key is safe in the browser: Row Level Security only lets visitors
   insert sign-ups and Contact Us messages, never read them.
   NEVER put the service_role key, Stripe secret, or GoHighLevel API key here. */
window.HKW_CONFIG = {
  supabaseUrl: "https://ifysjtiphdvamocosngp.supabase.co",
  supabaseKey: "sb_publishable_JAe4RwqLhzNmIWifIA7xJA_5YyP2jzO",
  // Forms only send data on these hosts (the claude.ai preview and local file:// runs send nothing).
  hosts: ["herkingdomwealth.com", "www.herkingdomwealth.com", "beta.herkingdomwealth.com"],
  source: "app",
  // true shows the preview strip (Unlock All Tiers, Admin) on the live site; keep false for real members.
  previewTools: false
};
