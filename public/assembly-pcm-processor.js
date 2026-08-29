class AssemblyPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.targetSampleRate = 16000;

    // 50 ms em 16 kHz = 800 amostras.
    this.packetDurationMs = 50;

    this.samplesPerPacket = Math.round(
      (this.targetSampleRate * this.packetDurationMs) / 1000
    );

    this.outputBuffer = new Int16Array(
      this.samplesPerPacket
    );

    this.outputIndex = 0;

    // Estado do resampling contínuo.
    this.resampleAccumulator = 0;
    this.resampleSum = 0;
    this.resampleCount = 0;
  }

  pushSample(sample) {
    const clipped = Math.max(
      -1,
      Math.min(1, sample)
    );

    const intSample =
      clipped < 0
        ? clipped * 32768
        : clipped * 32767;

    this.outputBuffer[
      this.outputIndex
    ] = Math.round(intSample);

    this.outputIndex += 1;

    if (
      this.outputIndex >=
      this.samplesPerPacket
    ) {
      const buffer =
        this.outputBuffer.buffer;

      this.port.postMessage(
        buffer,
        [buffer]
      );

      this.outputBuffer =
        new Int16Array(
          this.samplesPerPacket
        );

      this.outputIndex = 0;
    }
  }

  process(inputs) {
    const input = inputs[0];

    if (
      !input ||
      input.length === 0
    ) {
      return true;
    }

    const channel = input[0];

    if (!channel) {
      return true;
    }

    if (
      sampleRate ===
      this.targetSampleRate
    ) {
      for (
        let index = 0;
        index < channel.length;
        index += 1
      ) {
        this.pushSample(
          channel[index]
        );
      }

      return true;
    }

    // Resampling contínuo para dispositivos
    // que não usam 16 kHz nativamente.
    for (
      let index = 0;
      index < channel.length;
      index += 1
    ) {
      this.resampleSum +=
        channel[index];

      this.resampleCount += 1;

      this.resampleAccumulator +=
        this.targetSampleRate;

      if (
        this.resampleAccumulator >=
        sampleRate
      ) {
        this.resampleAccumulator -=
          sampleRate;

        const averagedSample =
          this.resampleCount > 0
            ? this.resampleSum /
              this.resampleCount
            : channel[index];

        this.pushSample(
          averagedSample
        );

        this.resampleSum = 0;
        this.resampleCount = 0;
      }
    }

    return true;
  }
}

registerProcessor(
  "assembly-pcm-processor",
  AssemblyPCMProcessor
);