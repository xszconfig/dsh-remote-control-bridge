/** 单条交付通知记录（与协议 DeliveryNoticeWire 同构，独立声明避免协议耦合）。 */
export interface DeliveryRecord {
    sessionId: string;
    turnKey: string;
    title: string;
    body: string;
    isSubagent: boolean;
    completedAt: number;
}
/** 台账上限：超出后写盘时淘汰最旧（completedAt 升序的头部）。 */
export declare const MAX_DELIVERIES = 200;
export declare function loadDeliveries(file: string): DeliveryRecord[];
export declare function writeDeliveries(file: string, records: DeliveryRecord[]): void;
