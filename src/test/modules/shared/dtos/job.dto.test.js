import formatJob, { formatJob as defaultFormatJob, formatJobMinimal } from '../../../../modules/shared/dtos/JobDTO.js';

describe('JobDTO', () => {
  test('returns null for undefined input', () => {
    expect(defaultFormatJob(undefined)).toBeNull();
    expect(formatJobMinimal(undefined)).toBeNull();
  });

  test('formats fixed budget job correctly', () => {
    const job = {
      _id: 'j1',
      title: 'Build site',
      description: 'desc',
      category: 'web',
      skills: ['js'],
      budgetType: 'fixed',
      budgetAmount: 5000,
      duration: '1 month',
      experienceLevel: 'mid',
      projectSize: 'small',
      location: { type: 'onsite', country: 'PK', city: 'Lahore', timezone: 'PKT' },
      client: { _id: 'c1', name: 'ACME', email: 'c@acme', companyName: 'ACME Inc', avatar: 'a.jpg' },
      status: 'open',
      proposalsCount: 2,
      maxProposals: 10,
      attachments: [{ name: 'doc.pdf', url: 'u', size: 100, uploadedAt: 't' }],
      applicationDeadline: 'd',
      startDate: 's',
      isPublic: true,
      isFeatured: false,
      views: 12,
      isExpired: false,
      canAcceptProposals: () => true,
      createdAt: 'c',
      updatedAt: 'u'
    };

    const out = defaultFormatJob(job);
    expect(out.id).toBe('j1');
    // Accept formatted currency with or without comma
    expect(out.budgetDisplay).toMatch(/\$5,?000/);
    expect(out.location.country).toBe('PK');
    expect(out.client.id).toBe('c1');
    expect(out.attachments[0].name).toBe('doc.pdf');
    expect(out.canAcceptProposals).toBe(true);
  });

  test('formats hourly budget job correctly', () => {
    const job = {
      id: 'j2',
      title: 'Hourly task',
      skills: null,
      budgetType: 'hourly',
      hourlyRate: { min: 10, max: 20 },
      canAcceptProposals: () => false
    };

    const out = defaultFormatJob(job);
    expect(out.id).toBe('j2');
    expect(out.skills).toEqual([]);
    expect(out.hourlyRate).toEqual({ min: 10, max: 20 });
    expect(out.budgetDisplay).toBe('$10-$20/hr');
    expect(out.canAcceptProposals).toBe(false);
  });

  test('client as id handled and defaults applied', () => {
    const job = {
      id: 'j3',
      title: 'No client details',
      budgetType: 'unknown',
    };

    const out = defaultFormatJob(job);
    expect(out.client).toBeUndefined();
    expect(out.proposalsCount).toBe(0);
    expect(out.views).toBe(0);
  });

  test('formatJobMinimal includes required fields and defaults', () => {
    const job = { _id: 'jm1', title: 'M', budgetType: 'fixed', budgetAmount: 100 };
    const out = formatJobMinimal(job);
    expect(out.id).toBe('jm1');
    expect(out.proposalsCount).toBe(0);
    expect(out.views).toBe(0);
  });
});
