import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/hub_parcel.dart';
import '../repositories/parcel_repository.dart';
class DeliverParcel {
  final HubParcelRepository repo;
  DeliverParcel(this.repo);
  Future<Either<Failure, HubParcel>> call(DeliverParams p) => repo.deliverParcel(parcelId: p.parcelId, otp: p.otp);
}
class DeliverParams {
  final String parcelId;
  final String otp;
  const DeliverParams({required this.parcelId, required this.otp});
}
