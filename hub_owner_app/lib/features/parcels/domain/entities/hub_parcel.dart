import 'package:equatable/equatable.dart';
enum ParcelStatus { received, ready_for_pickup, delivered, expired }
class HubParcel extends Equatable {
  final String id;
  final String trackingCode;
  final String recipientName;
  final String recipientPhone;
  final String recipientAddress;
  final int basePostCost;
  final int? calculatedFee;
  final ParcelStatus status;
  final DateTime receivedAt;
  const HubParcel({required this.id, required this.trackingCode, required this.recipientName, required this.recipientPhone, required this.recipientAddress, required this.basePostCost, this.calculatedFee, required this.status, required this.receivedAt});
  @override List<Object?> get props => [id, trackingCode, status];
}
