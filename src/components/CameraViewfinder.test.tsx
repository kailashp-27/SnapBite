// @vitest-environment jsdom
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {render, screen, fireEvent, waitFor, cleanup} from '@testing-library/react';
import CameraViewfinder from './CameraViewfinder';

afterEach(cleanup);

describe('CameraViewfinder', () => {
  const mockStop = vi.fn();
  const mockGetTracks = vi.fn(() => [{
    stop: mockStop,
    getCapabilities: () => ({torch: false}),
    applyConstraints: vi.fn(),
  }]);

  beforeEach(() => {
    vi.restoreAllMocks();
    mockStop.mockClear();
    mockGetTracks.mockClear();

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => {
          return {
            getTracks: mockGetTracks,
            getVideoTracks: () => mockGetTracks(),
          } as unknown as MediaStream;
        }),
      },
      writable: true,
      configurable: true,
    });
  });

  it('requests environment (back) camera on mount', async () => {
    render(
      <CameraViewfinder
        title="Test Camera"
        onCapture={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText('Test Camera')).toBeTruthy();
    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({
          video: expect.objectContaining({
            facingMode: expect.anything(),
          }),
        })
      );
    });
  });

  it('renders shutter button, close button, and switch camera button', async () => {
    const handleClose = vi.fn();
    render(
      <CameraViewfinder
        title="Food Viewfinder"
        onCapture={vi.fn()}
        onClose={handleClose}
      />
    );

    expect(screen.getByLabelText('Take photo')).toBeTruthy();
    expect(screen.getByLabelText('Close camera')).toBeTruthy();
    expect(screen.getByLabelText('Switch camera (front/back)')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Close camera'));
    expect(handleClose).toHaveBeenCalled();
  });

  it('falls back to system camera when getUserMedia is denied or unavailable', async () => {
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn(async () => {
          throw new Error('Permission denied');
        }),
      },
      writable: true,
      configurable: true,
    });

    render(
      <CameraViewfinder
        title="Denied Camera"
        onCapture={vi.fn()}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/Camera permission was denied/i)).toBeTruthy();
    });
    expect(screen.getByText(/Open System Camera/i)).toBeTruthy();
  });
});
