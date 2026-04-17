const cron = require('node-cron');
const nodemailer = require('nodemailer');

const WEEKLY_REPORT_RECIPIENT = 'oluwatobiemmanuel324@gmail.com';

function buildTransporter() {
  return nodemailer.createTransport({
    host: 'sandbox.smtp.mailtrap.io',
    port: Number(process.env.MAILTRAP_PORT || 2525),
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.MAILTRAP_USER || 'a4c5437f986340',
      pass: process.env.MAILTRAP_PASS || '57678a7ef09995'
    },
    authMethod: 'LOGIN'
  });
}

function formatKoboToNaira(kobo) {
  const amount = Number(kobo || 0) / 100;
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    maximumFractionDigits: 2
  }).format(amount);
}

async function buildWeeklyFinanceSnapshot(prisma) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);

  const payments = await prisma.payment.findMany({
    where: {
      status: 'success',
      createdAt: { gte: weekStart }
    },
    select: {
      userId: true,
      amount: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalRevenueKobo = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const payingUserIds = Array.from(new Set(payments.map((payment) => Number(payment.userId)).filter(Number.isFinite)));

  let newSubscriptions = 0;
  if (payingUserIds.length) {
    const firstSuccessByUser = await prisma.payment.findMany({
      where: {
        status: 'success',
        userId: { in: payingUserIds }
      },
      select: { userId: true, createdAt: true },
      orderBy: { createdAt: 'asc' }
    });

    const earliestPaymentMap = new Map();
    firstSuccessByUser.forEach((item) => {
      if (!earliestPaymentMap.has(item.userId)) {
        earliestPaymentMap.set(item.userId, item.createdAt);
      }
    });

    earliestPaymentMap.forEach((firstPaidAt) => {
      if (new Date(firstPaidAt) >= weekStart) {
        newSubscriptions += 1;
      }
    });
  }

  const membershipByUser = new Map();
  if (payingUserIds.length) {
    const memberships = await prisma.groupMember.findMany({
      where: { userId: { in: payingUserIds } },
      select: {
        userId: true,
        joinedAt: true,
        group: {
          select: {
            id: true,
            name: true,
            joinCode: true
          }
        }
      },
      orderBy: { joinedAt: 'desc' }
    });

    memberships.forEach((membership) => {
      if (!membershipByUser.has(membership.userId)) {
        membershipByUser.set(membership.userId, membership.group);
      }
    });
  }

  const groupRevenueMap = new Map();
  payments.forEach((payment) => {
    const group = membershipByUser.get(payment.userId);
    const groupKey = group ? `${group.id}:${group.name}` : '0:Unassigned';
    const existing = groupRevenueMap.get(groupKey) || {
      groupName: group ? group.name : 'Unassigned',
      joinCode: group ? group.joinCode : '-',
      revenueKobo: 0,
      contributors: new Set()
    };

    existing.revenueKobo += Number(payment.amount || 0);
    existing.contributors.add(payment.userId);
    groupRevenueMap.set(groupKey, existing);
  });

  const topPayingGroups = Array.from(groupRevenueMap.values())
    .map((entry) => ({
      groupName: entry.groupName,
      joinCode: entry.joinCode,
      revenueKobo: entry.revenueKobo,
      contributors: entry.contributors.size
    }))
    .sort((a, b) => b.revenueKobo - a.revenueKobo)
    .slice(0, 5);

  return {
    weekStart,
    totalRevenueKobo,
    paymentsCount: payments.length,
    newSubscriptions,
    topPayingGroups
  };
}

function buildSummaryHtml(report) {
  return `
    <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 24px; color: #111827;">
      <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
        <div style="padding: 20px 24px; background: #0f172a; color: #ffffff;">
          <h2 style="margin: 0; font-size: 20px;">Weekly Financial Summary</h2>
          <p style="margin: 8px 0 0; color: #cbd5e1; font-size: 13px;">Learn Lite automated Sunday report</p>
        </div>
        <div style="padding: 24px;">
          <div style="display: grid; gap: 10px; margin-bottom: 20px;">
            <div><strong>Period:</strong> ${report.weekStart.toLocaleDateString()} - ${new Date().toLocaleDateString()}</div>
            <div><strong>Total Revenue:</strong> ${formatKoboToNaira(report.totalRevenueKobo)}</div>
            <div><strong>Successful Payments:</strong> ${report.paymentsCount}</div>
            <div><strong>New Subscriptions:</strong> ${report.newSubscriptions}</div>
          </div>

          <h3 style="margin: 0 0 10px; font-size: 16px;">Top Paying Groups</h3>
          ${report.topPayingGroups.length ? `
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr>
                  <th style="text-align: left; border-bottom: 1px solid #e5e7eb; padding: 8px 4px;">Group</th>
                  <th style="text-align: left; border-bottom: 1px solid #e5e7eb; padding: 8px 4px;">Join Code</th>
                  <th style="text-align: right; border-bottom: 1px solid #e5e7eb; padding: 8px 4px;">Contributors</th>
                  <th style="text-align: right; border-bottom: 1px solid #e5e7eb; padding: 8px 4px;">Revenue</th>
                </tr>
              </thead>
              <tbody>
                ${report.topPayingGroups.map((group) => `
                  <tr>
                    <td style="padding: 8px 4px; border-bottom: 1px solid #f1f5f9;">${group.groupName}</td>
                    <td style="padding: 8px 4px; border-bottom: 1px solid #f1f5f9;">${group.joinCode}</td>
                    <td style="padding: 8px 4px; border-bottom: 1px solid #f1f5f9; text-align: right;">${group.contributors}</td>
                    <td style="padding: 8px 4px; border-bottom: 1px solid #f1f5f9; text-align: right; font-weight: 600;">${formatKoboToNaira(group.revenueKobo)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : '<p style="color: #64748b; font-size: 13px;">No paid activity for this period.</p>'}
        </div>
      </div>
    </div>
  `;
}

async function runWeeklyFinancialSummary({ prisma }) {
  const report = await buildWeeklyFinanceSnapshot(prisma);
  const transporter = buildTransporter();

  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'Learn Lite <no-reply@learnlite.app>',
    to: WEEKLY_REPORT_RECIPIENT,
    subject: 'Learn Lite Weekly Financial Summary',
    html: buildSummaryHtml(report)
  });

  return report;
}

function startWeeklyFinancialReportCron(prisma) {
  const task = cron.schedule(
    '0 20 * * 0',
    async () => {
      try {
        const report = await runWeeklyFinancialSummary({ prisma });
        console.log('[CRON] Weekly financial report sent:', {
          revenueKobo: report.totalRevenueKobo,
          payments: report.paymentsCount,
          newSubscriptions: report.newSubscriptions
        });
      } catch (err) {
        console.error('[CRON] Weekly financial report failed:', err.message);
      }
    },
    {
      timezone: process.env.CRON_TIMEZONE || 'Africa/Lagos'
    }
  );

  console.log('[CRON] Weekly financial report scheduler active (Sunday 8:00 PM).');
  return task;
}

module.exports = {
  startWeeklyFinancialReportCron,
  runWeeklyFinancialSummary
};
