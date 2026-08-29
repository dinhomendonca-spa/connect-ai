class AssemblyPCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.targetSampleRate = 16000;

    // 100 ms em 16 kHz.
    this.samplesPerPacket = 1600;

    this.outputBuffer =
      new Int16Array(
        this.samplesPerPacket
      );

    this.outputIndex = 0;

    // Usado para converter qualquer
    // sample rate do dispositivo para 16 kHz.
    this.resampleAccumulator = 0;
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
    const input =
      inputs[0];

    if (
      !input ||
      input.length === 0
    ) {
      return true;
    }

    const channel =
      input[0];

    if (!channel) {
      return true;
    }

    // Se já estivermos em 16 kHz,
    // não precisamos reduzir.
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

    // Resampling simples e contínuo.
    // O acumulador evita perder sincronia
    // entre diferentes blocos do AudioWorklet.
    for (
      let index = 0;
      index < channel.length;
      index += 1
    ) {
      this.resampleAccumulator +=
        this.targetSampleRate;

      if (
        this.resampleAccumulator >=
        sampleRate
      ) {
        this.resampleAccumulator -=
          sampleRate;

        this.pushSample(
          channel[index]
        );
      }
    }

    return true;
  }
}

registerProcessor(
  "assembly-pcm-processor",
  AssemblyPCMProcessor
);