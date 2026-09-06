import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/hub_parcel.dart';
import '../repositories/parcel_repository.dart';
class ReceiveParcel {
  final HubParcelRepository repo;
  ReceiveParcel(this.repo);
  Future<Either<Failure, HubParcel>> call(String trackingCode) => repo.receiveParcel(trackingCode);
}
