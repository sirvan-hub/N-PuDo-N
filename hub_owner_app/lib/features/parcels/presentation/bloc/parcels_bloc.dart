import 'package:flutter_bloc/flutter_bloc.dart';
import '../../domain/usecases/get_my_parcels.dart';
import '../../domain/usecases/receive_parcel.dart';
import '../../domain/usecases/deliver_parcel.dart';
import 'parcels_event.dart';
import 'parcels_state.dart';
class HubParcelsBloc extends Bloc<HubParcelsEvent, HubParcelsState> {
  final GetMyParcels getMyParcels;
  final ReceiveParcel receiveParcel;
  final DeliverParcel deliverParcel;
  HubParcelsBloc({required this.getMyParcels, required this.receiveParcel, required this.deliverParcel}) : super(HubParcelsInitial()) {
    on<LoadParcelsEvent>((e, emit) async {
      emit(HubParcelsLoading());
      final res = await getMyParcels();
      res.fold((f) => emit(HubParcelsError(f.message)), (p) => emit(HubParcelsLoaded(p)));
    });
    on<ReceiveParcelEvent>((e, emit) async {
      emit(HubParcelsLoading());
      final res = await receiveParcel(e.trackingCode);
      res.fold((f) => emit(HubParcelsError(f.message)), (p) => emit(ParcelReceived(p)));
    });
    on<DeliverParcelEvent>((e, emit) async {
      emit(HubParcelsLoading());
      final res = await deliverParcel(DeliverParams(parcelId: e.parcelId, otp: e.otp));
      res.fold((f) => emit(HubParcelsError(f.message)), (p) => emit(ParcelDelivered(p)));
    });
  }
}
