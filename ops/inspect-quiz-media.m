// Local macOS decoder. Not part of the Worker or production upload path.
#import <Foundation/Foundation.h>
#import <AVFoundation/AVFoundation.h>
#import <ImageIO/ImageIO.h>
#import <CoreVideo/CoreVideo.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 2) return 1;
    NSURL *url = [NSURL fileURLWithPath:@(argv[1])];
    NSDictionary *result = nil;
    CGImageSourceRef imageSource = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
    if (imageSource && !CGImageSourceGetType(imageSource)) { CFRelease(imageSource); imageSource = NULL; }
    if (imageSource) {
      NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(imageSource, 0, NULL));
      NSInteger width = [properties[(id)kCGImagePropertyPixelWidth] integerValue];
      NSInteger height = [properties[(id)kCGImagePropertyPixelHeight] integerValue];
      if (width < 1 || height < 1 || width > 8192 || height > 8192 || width * height > 24000000 || CGImageSourceGetCount(imageSource) != 1) { CFRelease(imageSource); return 1; }
      CGImageRef image = CGImageSourceCreateImageAtIndex(imageSource, 0, NULL);
      CFRelease(imageSource);
      if (!image) return 1;
      CGImageRelease(image);
      result = @{ @"kind": @"image", @"duration": @0, @"width": @(width), @"height": @(height) };
    } else if ([@[@"wav", @"mp3"] containsObject:url.pathExtension]) {
      NSError *error = nil;
      AVAudioFile *audio = [[AVAudioFile alloc] initForReading:url error:&error];
      double rate = audio.processingFormat.sampleRate;
      double duration = audio.length / rate;
      if (!audio || !isfinite(duration) || rate < 8000 || rate > 96000 || duration <= 0 || duration > 180 || audio.processingFormat.channelCount > 2) return 1;
      AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:audio.processingFormat frameCapacity:4096];
      AVAudioFramePosition frames = 0;
      while (audio.framePosition < audio.length) {
        if (![audio readIntoBuffer:buffer error:&error] || buffer.frameLength == 0) return 1;
        frames += buffer.frameLength;
      }
      if (frames != audio.length) return 1;
      result = @{ @"kind": @"audio", @"duration": @(duration), @"width": @0, @"height": @0 };
    } else {
      AVURLAsset *asset = [AVURLAsset URLAssetWithURL:url options:@{AVURLAssetPreferPreciseDurationAndTimingKey: @YES, AVURLAssetReferenceRestrictionsKey: @(AVAssetReferenceRestrictionForbidAll)}];
      dispatch_semaphore_t loaded = dispatch_semaphore_create(0);
      [asset loadValuesAsynchronouslyForKeys:@[@"duration", @"tracks", @"playable"] completionHandler:^{ dispatch_semaphore_signal(loaded); }];
      if (dispatch_semaphore_wait(loaded, dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC))) return 1;
      double duration = CMTimeGetSeconds(asset.duration);
      if (!asset.playable || !isfinite(duration) || duration <= 0 || duration > 180 || asset.tracks.count < 1) { fputs("Invalid playable media metadata.\n", stderr); return 1; }
      for (AVMetadataFormat format in asset.availableMetadataFormats) {
        if ([asset metadataForFormat:format].count > 0) return 1;
      }
      NSInteger videos = 0, audios = 0, width = 0, height = 0;
      NSError *error = nil;
      AVAssetReader *reader = [[AVAssetReader alloc] initWithAsset:asset error:&error];
      if (!reader) { fputs("Decoder could not start.\n", stderr); return 1; }
      NSMutableArray *outputs = [NSMutableArray array];
      for (AVAssetTrack *track in asset.tracks) {
        NSDictionary *settings = nil;
        if ([track.mediaType isEqualToString:AVMediaTypeVideo]) {
          videos++; width = (NSInteger)fabs(track.naturalSize.width); height = (NSInteger)fabs(track.naturalSize.height);
          if (duration > 60 || width < 1 || height < 1 || width > 1920 || height > 1920) return 1;
          settings = nil; // Native video samples to avoid paravirtual hardware scaler failures in CI VMs.
        } else if ([track.mediaType isEqualToString:AVMediaTypeAudio]) {
          audios++; settings = @{ AVFormatIDKey: @(kAudioFormatLinearPCM) };
        } else return 1; // Reject subtitle, data and alternate text tracks.
        AVAssetReaderTrackOutput *output = [[AVAssetReaderTrackOutput alloc] initWithTrack:track outputSettings:settings];
        if (![reader canAddOutput:output]) return 1;
        [reader addOutput:output]; [outputs addObject:output];
      }
      if (videos > 1 || audios > 1 || ![reader startReading]) { fprintf(stderr,"Unsupported tracks or decoder start (%ld; %ld/%ld).\n",(long)reader.error.code,(long)videos,(long)audios); return 1; }
      for (AVAssetReaderTrackOutput *output in outputs) {
        NSInteger count = 0;
        CMSampleBufferRef sample;
        while ((sample = [output copyNextSampleBuffer])) { count++; CFRelease(sample); if (count > 20000) { [reader cancelReading]; return 1; } }
        if (count == 0) { fputs("No decodable media samples.\n", stderr); return 1; }
      }
      if (reader.status != AVAssetReaderStatusCompleted) { fputs("Decoder did not complete.\n", stderr); return 1; }
      result = @{ @"kind": videos ? @"video" : @"audio", @"duration": @(duration), @"width": @(width), @"height": @(height) };
    }
    NSData *data = [NSJSONSerialization dataWithJSONObject:result options:NSJSONWritingSortedKeys error:nil];
    if (!data) return 1;
    puts([[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding].UTF8String);
    return 0;
  }
}
