import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/hub_parcel.dart';
import '../repositories/parcel_repository.dart';
class GetMyParcels {
  final HubParcelRepository repo;
  GetMyParcels(this.repo);
  Future<Either<Failure, List<HubParcel>>> call() => repo.getMyParcels();
}
