import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://kxbxtnimpinxujtpnlso.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt4Ynh0bmltcGlueHVqdHBubHNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxODIxNjgsImV4cCI6MjA5Mjc1ODE2OH0.PjR4L-GlUkgc-ojDYvAVQA1I3KTCVAsoSVaJz7SPWFo";

export const supabase = createClient(supabaseUrl, supabaseKey);
