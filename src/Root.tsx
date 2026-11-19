import React from 'react';
import { Composition, Still } from 'remotion';
import { Episode, episodeFrames } from './Episode';
import { Thumbnail } from './Thumbnail';
import { FPS, LONG, SHORT, THUMB } from './style/tokens';
import type { Episode as EpisodeT, EpisodeProps } from './types';
import sample from '../episodes/sample/episode.json';

const defaultProps = { episode: sample } as unknown as EpisodeProps;

// Shorts kesmasi: shortScenes tartibida sahnalarni oladi (bo'lmasa — birinchi ~55 soniya)
export const shortCut = (e: EpisodeT): EpisodeT => {
  let scenes = e.shortScenes?.length
    ? e.shortScenes.map((id) => e.scenes.find((s) => s.id === id)).filter((s): s is EpisodeT['scenes'][number] => Boolean(s))
    : [];
  if (!scenes.length) {
    let t = 0;
    scenes = e.scenes.filter((s) => (t += s.durationSec) <= 55);
  }
  return { ...e, scenes };
};

const ShortEpisode: React.FC<EpisodeProps> = ({ episode }) => <Episode episode={shortCut(episode)} />;

export const Root: React.FC = () => (
  <>
    {/* Asosiy uzun video: 1920x1080, 30fps */}
    <Composition id="Episode" component={Episode} fps={FPS} width={LONG.width} height={LONG.height}
      durationInFrames={300} defaultProps={defaultProps}
      calculateMetadata={async ({ props }) => ({ durationInFrames: Math.max(1, episodeFrames(props.episode, FPS)) })} />
    {/* Shorts: 1080x1920, xuddi shu JSON dan qisqa kesma */}
    <Composition id="EpisodeShort" component={ShortEpisode} fps={FPS} width={SHORT.width} height={SHORT.height}
      durationInFrames={300} defaultProps={defaultProps}
      calculateMetadata={async ({ props }) => ({ durationInFrames: Math.max(1, episodeFrames(shortCut(props.episode), FPS)) })} />
    <Still id="Thumbnail" component={Thumbnail} width={THUMB.width} height={THUMB.height} defaultProps={defaultProps} />
  </>
);
