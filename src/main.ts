import EventEmitter from 'eventemitter3';

export interface ICANFilter {
    can_id?: number
    can_mask?: number
    extended?: boolean
}

export interface ICANConfig {
    can_filters?: Array<ICANFilter>
    receive_own_messages?: boolean
}

// https://python-can.readthedocs.io/en/master/message.html
export interface IMessage {
    timestamp?: number
    arbitration_id?: number
    dlc?: number
    is_extended_id?: boolean
    is_remote_frame?: boolean
    is_error_frame?: boolean
    data?: Uint8Array | Array<number>

    is_fd?: boolean
    bitrate_switch?: boolean
    error_state_indicator?: boolean
    channel_info?: string
}

// https://github.com/christiansandberg/python-can-remote/blob/master/can_remote/server.py
export type EventDataType =  'message' | 'bus_request' | 'bus_response' | 'periodic_start' | 'periodic_stop' | 'unknown';

export interface IEventData {
    type: EventDataType
    // Raw DataView is present instead of IMessage when message type is unknown
    payload: IMessage | DataView
}

const parseBinaryMessage = (raw: ArrayBufferLike) => {
    const data = new DataView(raw);
    const type = data.getUint8(0);

    switch (type) {
        case 1:
            // Got a CAN message in binary format
            const flags = data.getUint8(14);

            const message = <IMessage> {
                timestamp: data.getFloat64(1),
                arbitration_id: data.getUint32(9),
                dlc: data.getUint8(13),
                is_extended_id: Boolean(flags & 0x1),
                is_remote_frame: Boolean(flags & 0x2),
                is_error_frame: Boolean(flags & 0x4),
                data: new Uint8Array(raw, 15)
            };

            if (flags & 0x8) {
                message.is_fd = true;
                message.bitrate_switch = Boolean(flags & 0x10);
                message.error_state_indicator = Boolean(flags & 0x20);
            }
            return <IEventData> {type: 'message', payload: message};

        default:
            return <IEventData> {type: 'unknown', payload: data};
    }
}


export default class Bus extends EventEmitter {
    public channelInfo?: string
    public readonly url: string

    private readonly config: ICANConfig
    private socket: WebSocket

    constructor(url: string, config: ICANConfig) {
        super();

        this.url = url;
        this.config = config;
        this.socket = this.connect(this.url, ['can.binary+json.v1', 'can.json.v1']);
    }


    connect(url: string, protocols: Array<string>): WebSocket {
        const socket = new WebSocket(url, protocols);
        socket.binaryType = 'arraybuffer';

        socket.onopen = this.onSocketOpen.bind(this);
        socket.onmessage = this.onSocketMessage.bind(this);
        socket.onerror = this.onSocketError.bind(this);
        socket.onclose = this.onSocketClose.bind(this);

        return socket;
    }

    send(message: IMessage) {
        this.sendEvent('message', message);
    }

    sendPeriodic(message: IMessage, period: number, duration?: number) {
        this.sendEvent('periodic_start', {
            period,
            duration,
            msg: message
        });
    }

    stopPeriodic(arbitrationId: number) {
        this.sendEvent('periodic_stop', arbitrationId);
    }

    close() {
        this.socket.close();
    }

    private onSocketOpen() {
        this.sendEvent('bus_request', {config: this.config});
    }

    private onSocketMessage(event: MessageEvent) {
        let data: IEventData;

        if (event.data instanceof ArrayBuffer) {
            // Binary CAN Message
            data = parseBinaryMessage(event.data);
        } else {
            // JSON CAN Message
            // @ts-ignore: event.data if not an ArrayBuffer, is for sure string
            data = JSON.parse(event.data);
        }

        switch (data.type) {
            case 'bus_response':
                if ('channel_info' in data.payload) {
                    this.channelInfo = data.payload.channel_info;
                }

                this.emit('connect', this);
                break;

            default:
                this.emit(data.type, data.payload);
                break;
        }

    }

    private onSocketError(event: Event) {
        this.emit('error', event);
    }

    private onSocketClose(event: CloseEvent) {
        if (!event.wasClean) {
            this.emit('error', 'Connection terminated');
        } else if (event.code > 1001) {
            this.emit('error', event.reason || 'Terminated with code ' + event.code);
        }

        this.emit('close');
    }

    private sendEvent(type: string, payload: any) {
        const data = {
            type, payload
        }

        this.socket.send(
            JSON.stringify(data)
        )
    }
}