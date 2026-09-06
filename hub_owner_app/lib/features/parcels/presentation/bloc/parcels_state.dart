import 'package:equatable/equatable.dart';
import '../../domain/entities/hub_parcel.dart';
abstract class HubParcelsState extends Equatable { @override List<Object?> get props => []; }
class HubParcelsInitial extends HubParcelsState {}
class HubParcelsLoading extends HubParcelsState {}
class HubParcelsLoaded extends HubParcelsState {
  final List<HubParcel> parcels;
  HubParcelsLoaded(this.parcels);
  @override List<Object?> get props => [parcels];
}
class ParcelReceived extends HubParcelsState {
  final HubParcel parcel;
  ParcelReceived(this.parcel);
  @override List<Object?> get props => [parcel];
}
class ParcelDelivered extends HubParcelsState {
  final HubParcel parcel;
  ParcelDelivered(this.parcel);
  @override List<Object?> get props => [parcel];
}
class HubParcelsError extends HubParcelsState {
  final String message;
  HubParcelsError(this.message);
  @override List<Object?> get props => [message];
}
