import '../../domain/entities/hub_parcel.dart';
class HubParcelModel extends HubParcel {
  const HubParcelModel({required super.id, required super.trackingCode, required super.recipientName, required super.recipientPhone, required super.recipientAddress, required super.basePostCost, super.calculatedFee, required super.status, required super.receivedAt});
  factory HubParcelModel.fromJson(Map<String, dynamic> json) {
    return HubParcelModel(
      id: json['id'], trackingCode: json['tracking_code'], recipientName: json['recipient_name'],
      recipientPhone: json['recipient_phone'], recipientAddress: json['recipient_address'],
      basePostCost: json['base_post_cost'], calculatedFee: json['calculated_fee'],
      status: json['status'] == 'received' ? ParcelStatus.received : ParcelStatus.ready_for_pickup,
      receivedAt: DateTime.parse(json['received_at']),
    );
  }
}
