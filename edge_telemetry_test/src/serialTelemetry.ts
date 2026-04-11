import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

export interface SerialTelemetryConfig {
    portPath: string;
    baudRate: number;
    deviceId: string;
    includeHumidity: boolean;
}

export interface SerialTelemetryReading {
    deviceId: string;
    metric: string;
    value: number;
    ts: number;
}

export interface SerialSample {
    temperature: number;
    humidity: number | null;
    raw: string;
}

const SIMPLE_DHT_SAMPLE_RE =
    /^Sample OK:\s*(-?\d+(?:\.\d+)?)\s*\*C,\s*(-?\d+(?:\.\d+)?)\s*H$/i;

function parseFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number.parseFloat(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function parseJsonSample(line: string): SerialSample | null {
    if (!line.startsWith('{') || !line.endsWith('}')) {
        return null;
    }

    let payload: unknown;
    try {
        payload = JSON.parse(line);
    } catch {
        return null;
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
    }

    const record = payload as Record<string, unknown>;
    const temperature = parseFiniteNumber(record.temperature);
    const humidity =
        record.humidity === undefined ? null : parseFiniteNumber(record.humidity);

    if (temperature === null) {
        return null;
    }

    return {
        temperature,
        humidity,
        raw: line,
    };
}

function parseSimpleDhtSample(line: string): SerialSample | null {
    const match = SIMPLE_DHT_SAMPLE_RE.exec(line);
    if (!match) {
        return null;
    }

    const temperature = Number.parseFloat(match[1]);
    const humidity = Number.parseFloat(match[2]);
    if (!Number.isFinite(temperature) || !Number.isFinite(humidity)) {
        return null;
    }

    return {
        temperature,
        humidity,
        raw: line,
    };
}

export function parseSerialSample(line: string): SerialSample | null {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
        return null;
    }

    return parseJsonSample(trimmed) ?? parseSimpleDhtSample(trimmed);
}

export function buildSerialReadings(
    config: SerialTelemetryConfig,
    sample: SerialSample,
    ts: number,
): SerialTelemetryReading[] {
    const readings: SerialTelemetryReading[] = [
        {
            deviceId: config.deviceId,
            metric: 'temperature',
            value: sample.temperature,
            ts,
        },
    ];

    if (config.includeHumidity && sample.humidity !== null) {
        readings.push({
            deviceId: config.deviceId,
            metric: 'humidity',
            value: sample.humidity,
            ts,
        });
    }

    return readings;
}

function openPort(port: SerialPort): Promise<void> {
    return new Promise((resolve, reject) => {
        port.open((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

function closePort(port: SerialPort): Promise<void> {
    if (!port.isOpen) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        port.close((error) => {
            if (error) {
                reject(error);
                return;
            }

            resolve();
        });
    });
}

export interface SerialTelemetrySource {
    start: (onSample: (sample: SerialSample) => void) => Promise<void>;
    stop: () => Promise<void>;
}

export function createSerialTelemetrySource(config: SerialTelemetryConfig): SerialTelemetrySource {
    const port = new SerialPort({
        path: config.portPath,
        baudRate: config.baudRate,
        autoOpen: false,
    });
    const parser = port.pipe(new ReadlineParser({ delimiter: '\n' }));

    let started = false;
    let sampleListener: ((line: string) => void) | null = null;
    let errorListener: ((error: Error) => void) | null = null;

    return {
        async start(onSample: (sample: SerialSample) => void): Promise<void> {
            if (started) {
                return;
            }

            sampleListener = (line: string) => {
                const sample = parseSerialSample(line);
                if (!sample) {
                    return;
                }

                onSample(sample);
            };
            errorListener = (error: Error) => {
                console.error(`[edge-telemetry-test] Serial port error: ${error.message}`);
            };

            parser.on('data', sampleListener);
            port.on('error', errorListener);

            await openPort(port);
            started = true;
        },
        async stop(): Promise<void> {
            if (sampleListener) {
                parser.off('data', sampleListener);
                sampleListener = null;
            }
            if (errorListener) {
                port.off('error', errorListener);
                errorListener = null;
            }

            if (!started) {
                return;
            }

            started = false;
            await closePort(port);
        },
    };
}
