// Visual mouth amplitude from samples actually leaving the playback graph.
// Not phoneme recognition: Japanese articulation accuracy remains unverified.
export function playbackJaw(samples){let sum=0;for(const x of samples)sum+=x*x;return samples.length?Math.min(.65,Math.sqrt(sum/samples.length)*3.5):0;}
