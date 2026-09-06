import 'package:equatable/equatable.dart';
abstract class HubParcelsEvent extends Equatable { @override List<Object?> get props => []; }
class LoadParcelsEvent extends HubParcelsEvent {}
class ReceiveParcelEvent extends HubParcelsEvent {
  final String trackingCode;
  ReceiveParcelEvent(this.trackingCode);
  @override List<Object?> get props => [trackingCode];
}
class DeliverParcelEvent extends HubParcelsEvent {
  final String parcelId;
  final String otp;
  DeliverParcelEvent({required this.parcelId, required this.otp});
  @override List<Object?> get props => [parcelId, otp];
}
