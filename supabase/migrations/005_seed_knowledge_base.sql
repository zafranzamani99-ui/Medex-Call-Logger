-- Migration 005: Seed knowledge base with common Medex issues
-- WHY: Spec Section 12.1 lists 12 pre-seeded entries. These are the most common
-- issues agents encounter daily. Having these from day 1 means agents can
-- use KB quick-fill immediately without manually building the knowledge base.

INSERT INTO knowledge_base (issue_type, issue, fix, added_by) VALUES
  ('Login Issue',
   'Cannot open PC / login stuck',
   'Ask clinic to restart PC. If still cannot, remote in via UltraViewer.',
   'System'),

  ('Login Issue',
   'MDOCMS.exe missing',
   'Remote in, check C:\Medex folder. Re-copy MDOCMS.exe. Relaunch.',
   'System'),

  ('Login Issue',
   'Cannot open dispensary PC',
   'Check dispensary user account. Restart machine. Check network.',
   'System'),

  ('Printing',
   'Template not printing / wrong template',
   'Settings > Print Template. Verify correct template selected. Re-print test.',
   'System'),

  ('Printing',
   'Print and QMS not working',
   'Check printer online + set as default. Restart Print Spooler via services.msc.',
   'System'),

  ('Inventory',
   'Cannot enter medicine at inventory portal',
   'Admin > User Rights > enable Inventory access.',
   'System'),

  ('Schedule',
   'Cannot edit patient name',
   'Admin > User Rights > enable Edit Patient Name.',
   'System'),

  ('Others',
   'Clinic wants to delete all data',
   'ESCALATE IMMEDIATELY. Do NOT allow deletion. Log as Escalated.',
   'System'),

  ('Others',
   'eINV / consolidated eINV submission',
   'Schedule with senior staff. Do not do remotely without supervision.',
   'System'),

  ('Login Issue',
   'Password expired or forgotten',
   'Reset password via Admin panel. If admin access unavailable, escalate to senior.',
   'System'),

  ('Printing',
   'Receipt printer not detected',
   'Check USB connection. Reinstall printer driver. Set as default printer in Windows.',
   'System'),

  ('Others',
   'Request for new user account setup',
   'Admin > User Management > Add New User. Set appropriate access rights per clinic type.',
   'System');
