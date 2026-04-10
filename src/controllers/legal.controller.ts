import { Request, Response } from 'express';

// GET /legal/terms
export function getTerms(_req: Request, res: Response): void {
  res.json({
    title: 'Terms of Service',
    updatedAt: 'April 1, 2026',
    content: `# Terms of Service

Welcome to CloudShelve. By using our services, you agree to these terms. Please read them carefully.

## 1. Acceptance of Terms

By accessing or using CloudShelve ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service.

## 2. Description of Service

CloudShelve is a cloud storage management platform that allows users to connect, manage, and transfer files across multiple cloud storage providers including Google Drive, OneDrive, Dropbox, MEGA, and Amazon S3.

## 3. Account Registration

To use the Service, you must create an account. You agree to:
- Provide accurate and complete information during registration
- Maintain the security of your account credentials
- Notify us immediately of any unauthorized access to your account
- Be responsible for all activity that occurs under your account

## 4. Acceptable Use

You agree not to use the Service to:
- Upload, store, or transfer illegal, harmful, or infringing content
- Violate any applicable laws or regulations
- Attempt to gain unauthorized access to any systems or networks
- Interfere with or disrupt the integrity or performance of the Service
- Use the Service for any commercial purpose without our express written consent

## 5. Third-Party Cloud Providers

The Service integrates with third-party cloud storage providers. Your use of those providers is governed by their respective terms of service. CloudShelve is not responsible for the availability, accuracy, or security of third-party services.

## 6. Data and Privacy

Your use of the Service is also governed by our Privacy Policy, which is incorporated into these Terms by reference. By using the Service, you consent to our collection and use of your data as described in the Privacy Policy.

## 7. Intellectual Property

All content, features, and functionality of the Service — including software, design, logos, and trademarks — are owned by CloudShelve and are protected by applicable intellectual property laws.

## 8. Termination

We reserve the right to suspend or terminate your account at any time, with or without notice, for conduct that we believe violates these Terms or is harmful to other users, third parties, or the Service.

## 9. Disclaimer of Warranties

The Service is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement.

## 10. Limitation of Liability

To the maximum extent permitted by law, CloudShelve shall not be liable for any indirect, incidental, special, consequential, or punitive damages resulting from your use or inability to use the Service.

## 11. Changes to Terms

We may update these Terms from time to time. We will notify you of significant changes by updating the "updatedAt" date. Continued use of the Service after changes constitutes acceptance of the revised Terms.

## 12. Governing Law

These Terms are governed by and construed in accordance with applicable laws. Any disputes shall be resolved through binding arbitration or in the courts of competent jurisdiction.

## 13. Contact Us

If you have any questions about these Terms, please contact us at legal@cloudshelve.app.`,
  });
}

// GET /legal/privacy
export function getPrivacy(_req: Request, res: Response): void {
  res.json({
    title: 'Privacy Policy',
    updatedAt: 'April 1, 2026',
    content: `# Privacy Policy

Your privacy is important to us. This Privacy Policy explains how CloudShelve collects, uses, and protects your information.

## 1. Information We Collect

### Information You Provide
- **Account information:** Name, email address, or phone number when you register
- **Authentication data:** OAuth tokens for connected cloud storage providers
- **Communications:** Messages or feedback you send us

### Information Collected Automatically
- **Usage data:** Features you use, pages visited, actions taken within the app
- **Device information:** Device type, operating system, app version
- **Log data:** IP address, access times, error logs

## 2. How We Use Your Information

We use the information we collect to:
- Create and manage your account
- Provide, maintain, and improve the Service
- Connect and sync your cloud storage accounts
- Send transactional notifications (OTP codes, account alerts)
- Respond to your support requests
- Ensure the security and integrity of the Service
- Comply with legal obligations

## 3. Cloud Storage Access

When you connect a cloud storage provider, we request only the permissions necessary to perform the features you use (file listing, transfer, sync). We do not read, store, or process the content of your files beyond what is required to execute your requested operations.

OAuth tokens for connected providers are encrypted at rest and never shared with third parties.

## 4. Data Sharing

We do not sell your personal information. We may share information with:
- **Service providers:** Third-party vendors who help us operate the Service (hosting, analytics) under strict data processing agreements
- **Cloud providers:** Only the data necessary to execute operations you initiate
- **Legal authorities:** When required by law, court order, or to protect our rights

## 5. Data Retention

We retain your account data for as long as your account is active. If you delete your account, we will delete your personal data within 30 days, except where retention is required by law.

## 6. Security

We implement industry-standard security measures including:
- Encryption of data in transit (TLS) and at rest
- Secure token storage
- Regular security audits
- Access controls limiting employee access to user data

No method of transmission over the Internet is 100% secure. We cannot guarantee absolute security, but we take reasonable steps to protect your information.

## 7. Your Rights

Depending on your location, you may have the right to:
- Access the personal data we hold about you
- Request correction of inaccurate data
- Request deletion of your data
- Object to or restrict processing of your data
- Data portability

To exercise these rights, contact us at privacy@cloudshelve.app.

## 8. Children's Privacy

The Service is not directed to children under 13. We do not knowingly collect personal information from children under 13. If you believe we have collected such information, please contact us immediately.

## 9. Third-Party Links

The Service may contain links to third-party websites or services. We are not responsible for the privacy practices of those third parties and encourage you to review their privacy policies.

## 10. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material changes by updating the "updatedAt" date. Continued use of the Service after changes constitutes acceptance of the revised Policy.

## 11. Contact Us

If you have questions or concerns about this Privacy Policy, please contact us at:

**CloudShelve Privacy Team**
Email: privacy@cloudshelve.app`,
  });
}
