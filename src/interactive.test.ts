import { describe, it, expect, vi, beforeEach } from 'vitest';

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock('@inquirer/prompts', () => ({
  confirm: confirmMock,
  select: vi.fn(),
  checkbox: vi.fn(),
}));

import { promptOverwriteOrdersTemplates, promptReviewers } from './interactive.js';

describe('promptOverwriteOrdersTemplates', () => {
  beforeEach(() => {
    confirmMock.mockReset();
  });

  it('asks once with default false and a manifest-dir-aware message, returning the user answer', async () => {
    confirmMock.mockResolvedValueOnce(true);

    const result = await promptOverwriteOrdersTemplates('/tmp/.smithy');

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(confirmMock).toHaveBeenCalledWith({
      message: 'Overwrite existing orders templates at /tmp/.smithy/templates/orders/?',
      default: false,
    });
    expect(result).toBe(true);
  });

  it('returns whatever the underlying confirm yields (e.g. false when user declines)', async () => {
    confirmMock.mockResolvedValueOnce(false);

    const result = await promptOverwriteOrdersTemplates('/home/alice/.smithy');

    expect(result).toBe(false);
    expect(confirmMock).toHaveBeenCalledWith({
      message: 'Overwrite existing orders templates at /home/alice/.smithy/templates/orders/?',
      default: false,
    });
  });
});

it('offers repository reviewer deployment by default and honors a decline', async () => {
  confirmMock.mockReset().mockResolvedValueOnce(false);
  await expect(promptReviewers()).resolves.toBe(false);
  expect(confirmMock).toHaveBeenCalledWith({
    message: 'Deploy the repository reviewer baseline?',
    default: true,
  });
});
