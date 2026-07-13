import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadManifest } from '../src/manifest.js';
import fs from 'fs';

vi.mock('fs');

describe('manifest.js', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadManifest', () => {
    it('loads and parses a valid manifest file successfully', () => {
      const validManifest = {
        app: { base_url: 'http://localhost' },
        actions: {}
      };
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(validManifest));

      const result = loadManifest('/fake/path/manifest.json');
      expect(result).toEqual(validManifest);
    });

    it('throws clearly when file is missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      expect(() => loadManifest('/fake/missing.json')).toThrow(/Manifest not found: \/fake\/missing.json/);
    });

    it('throws clearly when file is malformed JSON', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('{ not valid json');

      expect(() => loadManifest('/fake/bad.json')).toThrow(/Failed to parse manifest.json/);
    });

    it('throws when required top-level keys are missing', () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      
      // Missing app
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ actions: {} }));
      expect(() => loadManifest('/fake/path')).toThrow(/manifest.json missing required field: "app"/);

      // Missing app.base_url
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ app: {}, actions: {} }));
      expect(() => loadManifest('/fake/path')).toThrow(/manifest.json missing required field: "app.base_url"/);

      // Missing actions
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ app: { base_url: 'url' } }));
      expect(() => loadManifest('/fake/path')).toThrow(/manifest.json missing required field: "actions"/);
    });
  });
});
