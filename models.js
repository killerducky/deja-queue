// WIP, not used yet

export class Item {
  constructor(raw) {
    Object.assign(this, raw);
  }

  get interval() {
    return rating2days(this.rating);
  }

  get due() {
    return calcDue(this);
  }

  get score() {
    return scoreItem(this);
  }
}

export class VideoItem extends Item {
  constructor(raw) {
    super(raw);
    this.type = "video";
    this.rating = raw.rating ?? DEFAULT_RATING;
    this.title = raw.title ?? raw.yt?.snippet?.title;
    this.channelTitle = raw.yt?.snippet?.videoOwnerChannelTitle || "—";
  }

  get thumbnailUrl() {
    if (this.source === "youtube") {
      return `https://i.ytimg.com/vi/${this.foreignKey}/default.jpg`;
    }
    if (this.source === "local") {
      return this.localThumbnailPath || "";
    }
    return "";
  }

  get duration() {
    if (this.scrapedDuration) return this.scrapedDuration;
    return isoDuration2seconds(this.yt?.contentDetails?.duration);
  }
}

export class PlaylistItem extends Item {
  constructor(raw, queue) {
    super(raw);
    this.type = "playlist";

    this._allChildren = raw.videoUuids.map((uuid, idx) => {
      const v = queue.find((x) => x.uuid === uuid);
      return new TrackItem(new VideoItem(v), this, idx);
    });

    if (!this.thumbnailUrl && this._allChildren[0]) {
      this.thumbnailUrl = this._allChildren[0].thumbnailUrl;
    }

    this._currentTrack = -1;
    this.type = "playlist";
  }

  get _children() {
    const start = this._currentTrack === -1 ? 0 : this._currentTrack;
    return this._allChildren.slice(start);
  }

  get duration() {
    return this._allChildren.reduce((sum, t) => sum + t.duration, 0);
  }
}

class WrappedItem {
  constructor(ref, extras = {}) {
    if (!ref) {
      console.log("ERROR: undefined input");
    }
    if (ref.ref) {
      console.log("ERROR: Already wrapped?");
    }
    this.ref = ref;
    Object.assign(this, extras);

    // Return a proxy that forwards unknown props to this.ref
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop in target) {
          return Reflect.get(target, prop, receiver);
        }
        return target.ref[prop];
      },
      set(target, prop, value, receiver) {
        if (prop in target) {
          return Reflect.set(target, prop, value, receiver);
        }
        target.ref[prop] = value;
        return true;
      },
    });
  }
}
